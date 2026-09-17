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


module.exports = { TODAY, line, at, bankScreenshot, receiptPhoto, RECEIPT_IMAGE };
