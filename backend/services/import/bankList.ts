import { extractAmounts, parseDateDetail, splitLeadingDate, toCents } from './tokens';
import type { DateDetail, ParsedAmount } from './tokens';
import type { Box, DraftFlag, ParserDraft, Row, TransactionType } from '../../types/import';

/**
 * A bank app's transaction list: one transaction per row that ends in an
 * amount, dated by the row itself or by the nearest date header above it.
 *
 * OCR can drop a minus sign with high confidence (measured 2026-09-16:
 * "-$23.47" read as "$23.47"), so an unsigned amount is never a confirmed
 * expense: it always carries `type_guessed`.
 *
 * A row with no amount after the first transaction is taken to be a date
 * header even when it does not read as a date — OCR misreads bold grey
 * headers ("Yesterday" -> "Yer", measured) — and ends the previous header's
 * reach. A row with an unknown date is flagged; a row silently given the
 * previous section's date is not.
 *
 * Some apps stack an entry: the amount on the right with the running balance
 * directly beneath it, and the description wrapping on the left. A row holding
 * one amount that sits right under the previous entry's amount, right-aligned
 * with it, is that entry's balance and the rest of its description. "Right
 * under" is a gap of under 0.4 of the amount's height: measured 0.26 for a
 * stacked balance, and never below 0.85 between single-line transactions.
 * Rows of pure symbols — chevrons, icons — are skipped rather than read as
 * headers.
 *
 * A description that wraps puts its second line on a row of its own with no
 * amount. Tucked under the description (same cut-off, left edges aligned) it
 * continues that description; measured 0.04 of the line height for a wrapped
 * name, and never below 0.97 for the date header after a transaction.
 */
const INCOME_WORDS = /\b(payroll|salary|deposit|e-?transfer (received|from)|refund|interest|dividend)\b/i;
const STATUS_WORDS = /\b(pending|posted)\b/gi;
const HAS_WORD = /[\p{L}\p{N}]/u;
const STACKED_GAP = 0.4;

/** An amount peeled off a line, with the box and confidence it came from. */
type AmountHit = ParsedAmount & { conf: number; box: Box };

/** A run of text peeled off a line as a description word, with its confidence. */
interface WordHit {
  text: string;
  conf: number;
}

/** A date, either a header's or a row's own leading date, with its confidence. */
type BankDate = DateDetail & { conf: number };

/**
 * `parseBankList`'s own draft, before `balance`/`amountBox` are stripped for
 * `finalize()`. `balance` starts as whatever this row read (often `null`) and
 * can be filled in by a later row that turns out to be a stacked balance.
 */
interface BankListDraft extends ParserDraft {
  balance: AmountHit | null;
  amountBox: Box;
}

export function parseBankList(rows: Row[], today: string): { drafts: ParserDraft[] } {
  const drafts: BankListDraft[] = [];
  let header: BankDate | null = null;
  let above: BankListDraft | null = null; // the draft on the row just above, while it may still take a balance
  let wrapping: { draft: BankListDraft; labelBox: Box } | null = null; // the last draft, and the lowest line of its description

  for (const row of rows) {
    if (!HAS_WORD.test(row.text)) continue;
    const whole = parseDateDetail(row.text, today);
    if (whole) {
      header = { ...whole, conf: row.conf };
      above = null;
      wrapping = null;
      continue;
    }

    const amounts: AmountHit[] = [];
    const words: WordHit[] = [];
    for (const line of row.lines) {
      if (!HAS_WORD.test(line.text)) continue;
      const { amounts: found, label } = extractAmounts(line.text);
      if (label) words.push({ text: label, conf: line.conf });
      for (const amount of found) amounts.push({ ...amount, conf: line.conf, box: line.box });
    }
    if (amounts.length === 0) {
      const first = row.lines.find((l) => HAS_WORD.test(l.text));
      if (wrapping && words.length && first && isTuckedUnder(first.box, wrapping.labelBox)) {
        appendDescription(wrapping.draft, words);
        wrapping.labelBox = first.box;
        continue;
      }
      if (drafts.length > 0) header = null;
      above = null;
      wrapping = null;
      continue;
    }

    const soleAmount = amounts[0];
    if (above && amounts.length === 1 && soleAmount && isBeneath(soleAmount.box, above.amountBox)) {
      above.balance = soleAmount;
      appendDescription(above, words);
      above = null;
      continue;
    }

    const txn = amounts.length >= 2 ? amounts[amounts.length - 2] : amounts[0];
    if (!txn) continue;
    let balance: AmountHit | null = null;
    if (amounts.length >= 2) {
      const last = amounts[amounts.length - 1];
      if (last) balance = last;
    }
    if (toCents(txn.value) === 0) continue;

    let label = words.map((w) => w.text).join(' ').replace(STATUS_WORDS, ' ').replace(/\s+/g, ' ').trim();
    let date: BankDate | null = null;
    const lead = splitLeadingDate(label, today);
    if (lead) {
      date = { day: lead.day, inferredYear: lead.inferredYear, conf: row.conf };
      label = lead.rest;
    } else if (header) {
      date = header;
    }

    const flags: DraftFlag[] = [];
    let type: TransactionType;
    if (txn.sign === -1) type = 'expense';
    else if (txn.sign === 1) type = 'income';
    else {
      type = INCOME_WORDS.test(label) ? 'income' : 'expense';
      flags.push('type_guessed');
    }
    if (!date) flags.push('missing_date');
    if (/\bpending\b/i.test(row.text)) flags.push('pending');
    if (txn.corrected) flags.push('corrected_chars');

    const draft: BankListDraft = {
      date: date ? date.day : null,
      amount: txn.value,
      currency: txn.currency || 'CAD',
      description: label,
      type,
      flags,
      conf: {
        amount: txn.conf * (txn.corrected ? 0.8 : 1),
        date: date ? date.conf * (date.inferredYear ? 0.9 : 1) : 0,
        description: label ? Math.min(...words.map((w) => w.conf)) : 0,
        type: flags.includes('type_guessed') ? 0.9 : 1,
      },
      balance,
      amountBox: txn.box,
      boxes: row.lines.map((l) => l.box),
    };
    drafts.push(draft);
    above = balance ? null : draft;
    const labelLine = row.lines.find((l) => HAS_WORD.test(l.text) && extractAmounts(l.text).label);
    wrapping = labelLine ? { draft, labelBox: labelLine.box } : null;
  }

  verifyBalances(drafts);
  return { drafts: drafts.map(({ balance: _balance, amountBox: _amountBox, ...draft }) => draft) };
}

function appendDescription(draft: BankListDraft, words: WordHit[]): void {
  if (words.length === 0) return;
  draft.description = `${draft.description} ${words.map((w) => w.text).join(' ')}`.trim();
  draft.conf.description = Math.min(draft.conf.description || 1, ...words.map((w) => w.conf));
}

const gapBetween = (lower: Box, upper: Box): number => lower.y - (upper.y + upper.height);
const isClose = (lower: Box, upper: Box): boolean => {
  const gap = gapBetween(lower, upper);
  return gap >= 0 && gap < STACKED_GAP * Math.max(lower.height, upper.height);
};

/** `lower` sits directly beneath `upper`, right edges aligned. */
function isBeneath(lower: Box, upper: Box): boolean {
  const rightEdges = Math.abs((lower.x + lower.width) - (upper.x + upper.width));
  return isClose(lower, upper) && rightEdges < 0.5 * Math.max(lower.height, upper.height);
}

/** `lower` sits directly beneath `upper`, left edges aligned. */
function isTuckedUnder(lower: Box, upper: Box): boolean {
  return isClose(lower, upper) && Math.abs(lower.x - upper.x) < 0.5 * Math.max(lower.height, upper.height);
}

/**
 * Consecutive running balances must differ by exactly the transaction between
 * them. Lists run newest-first or oldest-first; whichever order more pairs
 * agree with is taken as the list's order. A row the check agrees with is
 * `arithmetic_verified`; a row it disagrees with is `balance_mismatch`.
 *
 * This verifies the amount only, never the direction. A credit card's balance
 * rises with each purchase, and OCR drops minus signs from balances as readily
 * as from amounts, so the sign of a difference proves nothing about whether
 * money came in or went out.
 */
function verifyBalances(drafts: BankListDraft[]): void {
  const signedBalance = (balance: AmountHit): number => (balance.sign === -1 ? -1 : 1) * toCents(balance.value);

  const pairs: number[] = [];
  for (let i = 0; i + 1 < drafts.length; i++) {
    const current = drafts[i];
    const next = drafts[i + 1];
    if (current?.balance && next?.balance) pairs.push(i);
  }
  if (pairs.length === 0) return;

  let newestFirst = 0;
  let oldestFirst = 0;
  for (const i of pairs) {
    const current = drafts[i];
    const next = drafts[i + 1];
    if (!current?.balance || !next?.balance) continue;
    const diff = Math.abs(signedBalance(current.balance) - signedBalance(next.balance));
    if (diff === toCents(current.amount)) newestFirst++;
    if (diff === toCents(next.amount)) oldestFirst++;
  }

  for (const i of pairs) {
    const current = drafts[i];
    const next = drafts[i + 1];
    if (!current?.balance || !next?.balance) continue;
    const diff = Math.abs(signedBalance(current.balance) - signedBalance(next.balance));
    const target = newestFirst >= oldestFirst ? current : next;
    target.flags.push(diff === toCents(target.amount) ? 'arithmetic_verified' : 'balance_mismatch');
  }
}
