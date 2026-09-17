import { extractTrailingAmount, parseDate, parseDateDetail, toCents } from './tokens';
import type { DateDetail, ParsedAmount } from './tokens';
import type { Box, DraftFlag, ImageSize, ParserDraft, Row } from '../../types/import';

/**
 * A paper receipt: exactly one transaction, whose amount is the total line.
 *
 * A receipt is mostly numbers that are not the amount — item prices, tax,
 * tip, a card number, a phone number — so the total is chosen by its label,
 * and cross-checked against subtotal + tax (+ tip) when those are printed.
 */
const SUBTOTAL = /\bsub\s*-?\s*total\b/i;
const TAX = /\b(gst|hst|pst|qst|tax)\b/i;
const TOTAL_NOT_TAX = /\btotal\b(?!\s+tax)/i;
const TIP = /\b(tip|gratuity)\b/i;
const NOT_A_TOTAL = /\btotal\s+(savings|saved|items?|discount|qty|quantity|points)\b/i;
const TOTAL_RANKS: [RegExp, number][] = [
  [/\btotal\b/i, 4],
  [/\bamount\s+due\b/i, 3],
  [/\bbalance\s+due\b/i, 2],
  [/^amount\b/i, 1],
];
const PHONE = /\(?\b\d{3}\)?[\s.-]?\d{3}[\s.-]\d{4}\b/;
const URL = /www\.|https?:|\.(com|ca|net|org)\b/i;
const ADDRESS = /^\d+\s+.*\b(st|street|ave|avenue|rd|road|blvd|boulevard|dr|drive|way|cres|crescent|unit|suite|hwy|highway)\b/i;

/** An amount found at the end of a line, with the row's index on the receipt. */
interface AmountAt {
  amount: ParsedAmount;
  index: number;
}

/** The candidate chosen as the total: its rank, and the row it came from. */
interface TotalHit extends AmountAt {
  rank: number;
  row: Row;
}

export function parseReceipt(rows: Row[], image: ImageSize | null | undefined, today: string): { drafts: ParserDraft[] } {
  let total: TotalHit | null = null;
  const subtotals: AmountAt[] = [];
  const taxes: AmountAt[] = [];
  const tips: AmountAt[] = [];

  rows.forEach((row, index) => {
    const hit = extractTrailingAmount(row.text);
    if (!hit) return;
    const { label, amount } = hit;
    if (SUBTOTAL.test(label)) return subtotals.push({ amount, index });
    if (TIP.test(label)) return tips.push({ amount, index });
    if (TAX.test(label) && !TOTAL_NOT_TAX.test(label)) return taxes.push({ amount, index });
    if (NOT_A_TOTAL.test(label)) return undefined;
    const rank = Math.max(0, ...TOTAL_RANKS.filter(([re]) => re.test(label)).map(([, r]) => r));
    // `>=` so that of two equally ranked lines the lower one on the page wins.
    if (rank > 0 && (!total || rank >= total.rank)) total = { amount, rank, row, index };
    return undefined;
  });

  if (!total) return { drafts: [] };
  // `total` is reassigned inside the forEach closure above, so TypeScript
  // cannot carry its narrowed, non-null type into the nested closures below
  // (`between`) or even into this function's later statements. Rebind it to
  // a `const` once, which narrowing survives everywhere.
  const winner: TotalHit = total;

  const flags: DraftFlag[] = [];
  const subtotal = subtotals.filter((s) => s.index < winner.index).pop();
  if (subtotal) {
    const between = (item: AmountAt): boolean => item.index > subtotal.index && item.index < winner.index;
    const charges = [...taxes.filter(between), ...tips.filter(between)];
    if (charges.length > 0) {
      const sum = [subtotal, ...charges].reduce((acc, item) => acc + toCents(item.amount.value), 0);
      flags.push(sum === toCents(winner.amount.value) ? 'arithmetic_verified' : 'arithmetic_failed');
    }
  }

  const limit = image && image.height ? image.height * 0.2 : Infinity;
  const merchant = rows
    .filter((r) => r.box.y < limit && /[a-z]/i.test(r.text) && !PHONE.test(r.text)
      && !URL.test(r.text) && !ADDRESS.test(r.text) && !parseDate(r.text, today))
    .reduce<Row | null>((best, r) => (!best || r.height > best.height ? r : best), null);

  const date = findDate(rows, today);
  if (!date) flags.push('missing_date');
  if (winner.amount.corrected) flags.push('corrected_chars');

  return {
    drafts: [{
      date: date ? date.day : null,
      amount: winner.amount.value,
      currency: winner.amount.currency || 'CAD',
      description: merchant ? merchant.text : '',
      type: 'expense',
      flags,
      conf: {
        amount: winner.row.conf * (winner.amount.corrected ? 0.8 : 1),
        date: date ? date.conf * (date.inferredYear ? 0.9 : 1) : 0,
        description: merchant ? merchant.conf : 0,
        type: 1,
      },
      boxes: [winner.row.box, merchant ? merchant.box : null].filter((b): b is Box => b !== null),
    }],
  };
}

/** The first run of up to four words, anywhere on the receipt, that is a day. */
function findDate(rows: Row[], today: string): (DateDetail & { conf: number }) | null {
  for (const row of rows) {
    const tokens = row.text.split(/\s+/);
    for (let len = Math.min(4, tokens.length); len >= 1; len--) {
      for (let i = 0; i + len <= tokens.length; i++) {
        const detail = parseDateDetail(tokens.slice(i, i + len).join(' '), today);
        if (detail) return { ...detail, conf: row.conf };
      }
    }
  }
  return null;
}
