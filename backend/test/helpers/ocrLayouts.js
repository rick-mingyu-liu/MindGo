const { groupRows } = require('../../services/import/rows');

/**
 * Hand-built OCR output for the screenshot-parser tests.
 *
 * Lives under test/ so `node --test` loads it as a file with no tests of its
 * own; that is harmless and keeps the helpers next to their only users.
 */

const TODAY = '2026-09-16';

// One OCR line. Rows are laid out 60px apart; amounts sit at x = 600.
const line = (text, { x = 20, y = 0, conf = 0.99, width = text.length * 16, height = 40 } = {}) =>
  ({ text, conf, box: { x, y, width, height } });
const at = (row) => row * 60;

const bankScreenshot = () => groupRows([
  line('Transactions', { y: at(0) }),
  line('Sep 14', { y: at(1) }),
  line('SOBEYS #1234', { y: at(2) }), line('-$23.47', { x: 600, y: at(2) }),
  line('Payroll Deposit', { y: at(3) }), line('+$1,250.00', { x: 600, y: at(3) }),
  line('Sep 12', { y: at(4) }),
  line('Pending TIM HORTONS', { y: at(5) }), line('$4.25', { x: 600, y: at(5) }),
]);

const receiptPhoto = () => groupRows([
  line('SOBEYS', { y: 10, height: 70 }),
  line('450 Columbia St W', { y: at(2) }),
  line('(519) 555-0100', { y: at(3) }),
  line('2026/09/14 12:31', { y: at(4) }),
  line('BANANAS', { y: at(5) }), line('1.47', { x: 600, y: at(5) }),
  line('MILK 2L', { y: at(6) }), line('5.49', { x: 600, y: at(6) }),
  line('SUBTOTAL', { y: at(7) }), line('6.96', { x: 600, y: at(7) }),
  line('HST 13%', { y: at(8) }), line('0.71', { x: 600, y: at(8) }),
  line('TOTAL', { y: at(9) }), line('7.67', { x: 600, y: at(9) }),
  line('VISA ****1234', { y: at(10) }),
]);
const RECEIPT_IMAGE = { width: 800, height: 900 };

// A bank app that stacks each entry: description on the left over one to three
// lines, the amount on the right with the running balance directly beneath it,
// and one tall chevron spanning both. Boxes are the shipped model's output for
// a real screenshot (2026-09-17); the names and reference numbers are not.
const stackedBalanceLines = () => [
  line('SEP 16,2026', { x: 38, y: 39, width: 251, height: 44, conf: 0.92 }),
  line('INTERAC ETRNSFR SENT CLINIC', { x: 48, y: 156, width: 673, height: 46 }),
  line('$25.00', { x: 897, y: 147, width: 175, height: 62 }),
  line('>', { x: 1049, y: 192, width: 73, height: 63, conf: 0.43 }),
  line('TORONTO 20260000001ABCDEF', { x: 49, y: 234, width: 688, height: 45 }),
  line('$2,991.15', { x: 835, y: 225, width: 237, height: 58 }),
  line('SEP15,2026', { x: 35, y: 392, width: 256, height: 46 }),
  line('INTERAC ETRNSFR SENT ALEX', { x: 45, y: 511, width: 681, height: 47 }),
  line('$32.00', { x: 896, y: 501, width: 176, height: 62 }),
  line('√', { x: 1036, y: 533, width: 105, height: 90, conf: 0.08 }),
  line('SAMPLE PERSON', { x: 48, y: 588, width: 392, height: 46 }),
  line('$3,016.15', { x: 838, y: 580, width: 231, height: 56 }),
  line('20260000002GHIJK', { x: 48, y: 666, width: 475, height: 45 }),
  line('Accounts', { x: 62, y: 933, width: 189, height: 46 }),
  line('Pay & Transfer Bank services', { x: 319, y: 933, width: 562, height: 47 }),
  line('Offers', { x: 977, y: 925, width: 142, height: 57 }),
];
const STACKED_IMAGE = { width: 1206, height: 1103 };


module.exports = {
  TODAY, line, at, bankScreenshot, receiptPhoto, RECEIPT_IMAGE, stackedBalanceLines, STACKED_IMAGE,
};
