const { extractTrailingAmount, parseDate } = require('./tokens');
const { splitDateTime } = require('./uberActivity');

/**
 * Decides whether a screenshot is a receipt, a bank-app transaction list or
 * Uber's trip activity by counting signals for each; a tie goes to receipt,
 * then bank list. `confidence` is the winner's share of all signals, so a
 * screenshot with evidence for more than one scores low and is sent to the
 * fallback rather than parsed with false certainty.
 */
const RECEIPT_SIGNALS = [
  /\bsub\s*-?\s*total\b/i,
  /\btotal\b/i,
  /\b(gst|hst|pst|qst)\b/i,
  /\b(tip|gratuity)\b/i,
  /\bchange\b/i,
  /\b(visa|mastercard|amex|interac)\b/i,
  /[*xX]{4}\s?\d{4}\b/,
  /\b(cashier|receipt|thank you)\b/i,
];
const BANK_SIGNALS = [
  /\bpending\b/i,
  /\bposted\b/i,
  /\bbalance\b/i,
  /\btransactions\b/i,
  /\be-?transfer\b/i,
];

// Uber's Activity screen: its buttons and title, and trips dated with a time.
const UBER_SIGNALS = [
  /\brebook\b/i,
  /^activity$/im,
];

const round2 = (n) => Math.round(n * 100) / 100;

function classifyLayout(rows, today) {
  const text = rows.map((r) => r.text).join('\n');
  let receipt = RECEIPT_SIGNALS.filter((re) => re.test(text)).length;
  let bank = BANK_SIGNALS.filter((re) => re.test(text)).length;

  bank += Math.min(rows.filter((r) => parseDate(r.text, today)).length, 3);
  if (rows.filter((r) => extractTrailingAmount(r.text)).length >= 3) bank += 2;

  const totalLine = rows.some((r) => {
    const hit = extractTrailingAmount(r.text);
    return hit && /\btotal\b/i.test(hit.label) && !/\bsub\s*-?\s*total\b/i.test(hit.label);
  });
  if (totalLine) receipt += 2;

  let uber = UBER_SIGNALS.filter((re) => re.test(text)).length;
  uber += Math.min(rows.filter((r) => splitDateTime(r.text, today)).length, 3);

  const total = receipt + bank + uber;
  if (total === 0) return { layout: 'unknown', confidence: 0 };
  const best = Math.max(receipt, bank, uber);
  let layout = 'uber-activity';
  if (receipt === best) layout = 'receipt';
  else if (bank === best) layout = 'bank-list';
  return { layout, confidence: round2(best / total) };
}

module.exports = { classifyLayout };
