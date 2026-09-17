import { groupRows } from './rows';
import { classifyLayout } from './classify';
import { parseBankList } from './bankList';
import { parseReceipt } from './receipt';
import { parseUberActivity } from './uberActivity';
import { parseUberEatsOrders } from './uberEats';
import { parseWechatPay } from './wechat';
import { categorize } from './categorize';
import type { Draft, DraftFlag, ImageSize, OcrLine, ParseResult, ParserDraft } from '../../types/import';

/**
 * OCR lines in, draft transactions out. Pure: no database, no network, no
 * clock — `today` comes from the caller.
 *
 * `needsFallback` says the parser is not confident in what it produced; the
 * caller decides whether a fallback is available.
 */
const FALLBACK_BELOW_LAYOUT_CONFIDENCE = 0.6;
const VERIFIED_FLOOR = 0.95;
const round2 = (n: number): number => Math.round(n * 100) / 100;

interface ParseOcrInput {
  lines: readonly (OcrLine | null | undefined)[] | null | undefined;
  image?: ImageSize | null;
  today: string;
}

interface ParseOcrOptions {
  confidenceThreshold?: number;
}

export function parseOcr({ lines, image, today }: ParseOcrInput, { confidenceThreshold = 0.8 }: ParseOcrOptions = {}): ParseResult {
  const rows = groupRows(lines);
  if (rows.length === 0) {
    return {
      layout: 'unknown', layoutConfidence: 0, rows: [], warnings: ['no_text_found'],
      unparsedLines: [], needsFallback: false,
    };
  }

  const { layout, confidence } = classifyLayout(rows, today);
  let drafts: ParserDraft[] = [];
  if (layout === 'receipt') drafts = parseReceipt(rows, image, today).drafts;
  if (layout === 'bank-list') drafts = parseBankList(rows, today).drafts;
  if (layout === 'uber-activity') drafts = parseUberActivity(rows, today).drafts;
  if (layout === 'uber-eats-orders') drafts = parseUberEatsOrders(rows, today).drafts;
  if (layout === 'wechat-pay') drafts = parseWechatPay(rows, today).drafts;

  const out = drafts.map((draft) => finalize(draft, confidenceThreshold));
  return {
    layout,
    layoutConfidence: confidence,
    rows: out,
    warnings: [],
    unparsedLines: out.length === 0 ? rows.map((r) => r.text) : [],
    needsFallback: confidence < FALLBACK_BELOW_LAYOUT_CONFIDENCE
      || out.length === 0
      || out.some((r) => r.flags.includes('arithmetic_failed')),
  };
}

// `category` is optional on ParserDraft: present (even as null) means the
// parser knows the category, absent means finalize() should guess. A plain
// `'category' in draft` check is correct at runtime but still types as
// `string | null | undefined`, because TS can't rule out a key explicitly
// set to `undefined`; no parser does that, so this predicate states it.
function hasCategory(draft: ParserDraft): draft is ParserDraft & { category: string | null } {
  return 'category' in draft;
}

function finalize(draft: ParserDraft, threshold: number): Draft {
  const flags: DraftFlag[] = [...new Set(draft.flags)];
  const conf = { ...draft.conf };
  // Arithmetic that checks out proves the amount — not its direction, the
  // date or the merchant name — so only the amount is lifted.
  if (flags.includes('arithmetic_verified')) conf.amount = Math.max(conf.amount, VERIFIED_FLOOR);
  const confidence = Math.min(conf.amount, conf.date, conf.description, conf.type);
  if (confidence < threshold) flags.push('low_confidence');

  return {
    date: draft.date,
    amount: draft.amount,
    currency: draft.currency,
    description: draft.description,
    // A parser that knows the category — including that it cannot know —
    // says so; the keyword guess is for the rest.
    category: hasCategory(draft) ? draft.category : categorize(draft.description, draft.type),
    type: draft.type,
    confidence: round2(confidence),
    flags,
    source: 'parser',
    boxes: draft.boxes,
  };
}

/** Flags that mean "look at this row", as opposed to informational ones. */
export const WARNING_FLAGS: DraftFlag[] = ['arithmetic_failed', 'balance_mismatch', 'corrected_chars',
  'low_confidence', 'missing_date', 'type_guessed'];
