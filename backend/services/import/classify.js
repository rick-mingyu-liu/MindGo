const { extractTrailingAmount, parseDate } = require('./tokens');
const { splitDateTime } = require('./uberActivity');
const { splitOrderLine } = require('./uberEats');
const { isStamp, isMonthHeader } = require('./wechat');

/**
 * Decides whether a screenshot is a receipt, a bank-app transaction list,
 * Uber's trip activity, Uber Eats' past orders or WeChat Pay's transactions by
 * counting signals for each; a tie goes to the earlier in that list. `confidence` is the winner's share of all signals, so a
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

// Uber Eats' Past orders tab: its tab and button labels, and order lines.
const UBER_EATS_SIGNALS = [
  /\bview store\b/i,
  /\bpast orders\b/i,
];

// WeChat Pay's list: its words, English or Chinese, and its "2026/9" headers.
const WECHAT_SIGNALS = [
  /微信|零钱|转账|红包/,
  /\b(expenditures?|incomes?)\b|支出|收入/i,
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

  // The tab labels are on the Past items tab too, which holds no charges, so
  // they count only beside an order line.
  const orderLines = rows.flatMap((r) => r.lines).filter((l) => splitOrderLine(l.text, today)).length;
  const eats = orderLines === 0 ? 0
    : UBER_EATS_SIGNALS.filter((re) => re.test(text)).length + Math.min(orderLines, 3);

  // "9/13 20:23" alone could be any app's; it counts only beside WeChat's words.
  const lines = rows.flatMap((r) => r.lines);
  const stamps = lines.filter((l) => isStamp(l.text)).length;
  const wechatWords = WECHAT_SIGNALS.filter((re) => re.test(text)).length;
  const wechat = stamps === 0 || wechatWords === 0 ? 0
    : wechatWords + Math.min(stamps, 3) + (lines.some((l) => isMonthHeader(l.text)) ? 1 : 0);

  const total = receipt + bank + uber + eats + wechat;
  if (total === 0) return { layout: 'unknown', confidence: 0 };
  const best = Math.max(receipt, bank, uber, eats, wechat);
  let layout = 'wechat-pay';
  if (receipt === best) layout = 'receipt';
  else if (bank === best) layout = 'bank-list';
  else if (uber === best) layout = 'uber-activity';
  else if (eats === best) layout = 'uber-eats-orders';
  return { layout, confidence: round2(best / total) };
}

module.exports = { classifyLayout };
