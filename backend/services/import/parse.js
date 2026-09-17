const { groupRows } = require('./rows');
const { classifyLayout } = require('./classify');
const { parseBankList } = require('./bankList');
const { parseReceipt } = require('./receipt');
const { parseUberActivity } = require('./uberActivity');
const { parseUberEatsOrders } = require('./uberEats');
const { categorize } = require('./categorize');

/**
 * OCR lines in, draft transactions out. Pure: no database, no network, no
 * clock — `today` comes from the caller.
 *
 * `needsFallback` says the parser is not confident in what it produced; the
 * caller decides whether a fallback is available.
 */
const FALLBACK_BELOW_LAYOUT_CONFIDENCE = 0.6;
const VERIFIED_FLOOR = 0.95;
const round2 = (n) => Math.round(n * 100) / 100;

function parseOcr({ lines, image, today }, { confidenceThreshold = 0.8 } = {}) {
  const rows = groupRows(lines);
  if (rows.length === 0) {
    return {
      layout: 'unknown', layoutConfidence: 0, rows: [], warnings: ['no_text_found'],
      unparsedLines: [], needsFallback: false,
    };
  }

  const { layout, confidence } = classifyLayout(rows, today);
  let drafts = [];
  if (layout === 'receipt') drafts = parseReceipt(rows, image, today).drafts;
  if (layout === 'bank-list') drafts = parseBankList(rows, today).drafts;
  if (layout === 'uber-activity') drafts = parseUberActivity(rows, today).drafts;
  if (layout === 'uber-eats-orders') drafts = parseUberEatsOrders(rows, today).drafts;

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

function finalize(draft, threshold) {
  const flags = [...new Set(draft.flags)];
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
    category: 'category' in draft ? draft.category : categorize(draft.description, draft.type),
    type: draft.type,
    confidence: round2(confidence),
    flags,
    source: 'parser',
    boxes: draft.boxes,
  };
}

/** Flags that mean "look at this row", as opposed to informational ones. */
const WARNING_FLAGS = ['arithmetic_failed', 'balance_mismatch', 'corrected_chars',
  'low_confidence', 'missing_date', 'type_guessed'];

module.exports = { parseOcr, WARNING_FLAGS };
