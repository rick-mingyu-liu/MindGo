import { groupRows } from '../../services/import/rows';
import type { ImageSize, OcrLine, Row } from '../../types/import';

/**
 * Hand-built OCR output for the screenshot-parser tests.
 *
 * Lives under test/ so it sits next to its only users; `npm test` only runs
 * files matching `*.test.js` under `dist/test`, so this file is never run on
 * its own.
 */

export const TODAY = '2026-09-16';

interface LineOptions {
  x?: number;
  y?: number;
  conf?: number;
  width?: number;
  height?: number;
}

// One OCR line. Rows are laid out 60px apart; amounts sit at x = 600.
export const line = (text: string, { x = 20, y = 0, conf = 0.99, width = text.length * 16, height = 40 }: LineOptions = {}): OcrLine =>
  ({ text, conf, box: { x, y, width, height } });
export const at = (row: number): number => row * 60;

export const bankScreenshot = (): Row[] => groupRows([
  line('Transactions', { y: at(0) }),
  line('Sep 14', { y: at(1) }),
  line('SOBEYS #1234', { y: at(2) }), line('-$23.47', { x: 600, y: at(2) }),
  line('Payroll Deposit', { y: at(3) }), line('+$1,250.00', { x: 600, y: at(3) }),
  line('Sep 12', { y: at(4) }),
  line('Pending TIM HORTONS', { y: at(5) }), line('$4.25', { x: 600, y: at(5) }),
]);

export const receiptPhoto = (): Row[] => groupRows([
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
export const RECEIPT_IMAGE: ImageSize = { width: 800, height: 900 };

// A bank app that stacks each entry: description on the left over one to three
// lines, the amount on the right with the running balance directly beneath it,
// and one tall chevron spanning both. Boxes are the shipped model's output for
// a real screenshot (2026-09-17); the names and reference numbers are not.
export const stackedBalanceLines = (): OcrLine[] => [
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
export const STACKED_IMAGE: ImageSize = { width: 1206, height: 1103 };

// A dark-theme card list: a round icon left of every entry, which the model
// reads as a single CJK character — at up to 0.96 confidence — and a merchant
// name that wraps to a second line. Boxes are the shipped model's output for a
// real screenshot (2026-09-17); the merchants are not.
export const iconListLines = (): OcrLine[] => [
  line('Wed, Sep 16', { x: 31, y: 30, width: 247, height: 55 }),
  line('凸', { x: 51, y: 149, width: 94, height: 79, conf: 0.51 }),
  line('Noodle House', { x: 164, y: 165, width: 263, height: 50, conf: 0.94 }),
  line('$46.84 CAD', { x: 897, y: 165, width: 271, height: 50 }),
  line('Tue, Sep 15', { x: 30, y: 322, width: 233, height: 59 }),
  line('曰', { x: 52, y: 454, width: 89, height: 62, conf: 0.61 }),
  line('CAD Deposit', { x: 164, y: 457, width: 286, height: 59 }),
  line('+$100.00 CAD', { x: 850, y: 455, width: 325, height: 55 }),
  line('Mon, Sep 14', { x: 31, y: 792, width: 244, height: 50 }),
  line('凸', { x: 50, y: 923, width: 90, height: 78, conf: 0.96 }),
  line('Sq *Corner Bakery', { x: 164, y: 907, width: 443, height: 55 }),
  line('$45.03 CAD', { x: 897, y: 933, width: 271, height: 54 }),
  line('Annex', { x: 163, y: 964, width: 155, height: 55 }),
  line('巴', { x: 55, y: 1279, width: 82, height: 71, conf: 0.19 }),
  line('Uber Canada/Ubertrip', { x: 165, y: 1291, width: 472, height: 55 }),
  line('$9.96 CAD', { x: 923, y: 1288, width: 247, height: 55 }),
  line('©', { x: 52, y: 1456, width: 86, height: 60, conf: 0.41 }),
  line('CAD Deposit', { x: 164, y: 1461, width: 286, height: 55 }),
  line('+$100.00 CAD', { x: 849, y: 1461, width: 325, height: 50 }),
  line('飞', { x: 547, y: 1622, width: 126, height: 98, conf: 0.89 }),
  line('Home', { x: 128, y: 1711, width: 118, height: 47 }),
  line('Trade', { x: 549, y: 1707, width: 124, height: 54 }),
];
export const ICON_IMAGE: ImageSize = { width: 1206, height: 1848 };

// Uber's Activity screen: a map card for the latest trip, then one card per
// trip — destination (which can wrap), "Sep 16 • 6:14 p.m." beside a Rebook
// button, and the fare on its own line. Boxes are the shipped model's output
// for a real screenshot (2026-09-17); the places are not.
export const uberActivityLines = (): OcrLine[] => [
  line('9:371', { x: 88, y: 47, width: 157, height: 54, conf: 0.98 }),
  line('96', { x: 644, y: 51, width: 208, height: 49, conf: 0.93 }),
  line('Activity', { x: 9, y: 150, width: 309, height: 96 }),
  line('Past', { x: 17, y: 286, width: 127, height: 60 }),
  line('YO', { x: 303, y: 418, width: 432, height: 131, conf: 0.8 }),
  line('940', { x: 726, y: 459, width: 29, height: 6, conf: 0.37 }),
  line('MAPLE HILL RIVER VALL', { x: 372, y: 495, width: 494, height: 61, conf: 0.96 }),
  line('KING STW', { x: 129, y: 622, width: 259, height: 125 }),
  line('CABB', { x: 722, y: 618, width: 137, height: 42 }),
  line('Noodle House', { x: 61, y: 799, width: 266, height: 49 }),
  line('Sep 16 • 7:16 p.m .', { x: 63, y: 862, width: 264, height: 41, conf: 0.97 }),
  line('$7.53', { x: 57, y: 904, width: 103, height: 48 }),
  line('☆ Rate', { x: 82, y: 997, width: 157, height: 59, conf: 0.95 }),
  line(' Rebook', { x: 282, y: 996, width: 201, height: 59, conf: 0.93 }),
  line('Riverside Clinic', { x: 210, y: 1169, width: 333, height: 42 }),
  line('Sep 16 • 6:14 p.m.', { x: 210, y: 1222, width: 263, height: 41, conf: 0.97 }),
  line('Rebook', { x: 674, y: 1213, width: 198, height: 54 }),
  line('$10.38', { x: 207, y: 1267, width: 116, height: 47 }),
  line('Riverside Clinic', { x: 210, y: 1370, width: 333, height: 42 }),
  line('Sep 14 • 4:03 p.m.', { x: 209, y: 1423, width: 272, height: 42, conf: 0.94 }),
  line(' Rebook', { x: 674, y: 1414, width: 198, height: 54, conf: 0.93 }),
  line('$9.96', { x: 203, y: 1468, width: 108, height: 48 }),
  line('Golden Lotus Chinese', { x: 210, y: 1570, width: 353, height: 43 }),
  line('Seafood Cuisine', { x: 211, y: 1617, width: 297, height: 41 }),
  line(' Rebook', { x: 676, y: 1637, width: 194, height: 53, conf: 0.94 }),
  line('Aug 29 • 6:59 p.m .', { x: 210, y: 1666, width: 279, height: 43, conf: 0.98 }),
  line('$11.89', { x: 206, y: 1713, width: 114, height: 48 }),
  line('Lakeside Park', { x: 209, y: 1814, width: 174, height: 46 }),
  line('Aug 21 • 12:53 p.m.', { x: 210, y: 1868, width: 285, height: 43, conf: 0.95 }),
  line(' Rebook', { x: 676, y: 1860, width: 195, height: 54, conf: 0.94 }),
  line('$8.40', { x: 207, y: 1915, width: 106, height: 46 }),
];
export const UBER_IMAGE: ImageSize = { width: 920, height: 2000 };

// Uber Eats' Past orders tab: store name, then "Mar 15 • $60.54 • 1 item",
// then the first items, with the store's logo to the left — which the model
// reads as text on the same rows — and a View store button to the right.
// Boxes and key lines are the shipped model's output for a real screenshot
// (2026-09-17), squeezed spaces and all; the items are not.
export const uberEatsOrderLines = (): OcrLine[] => [
  line('10:231', { x: 82, y: 49, width: 169, height: 49, conf: 0.98 }),
  line('94', { x: 642, y: 44, width: 213, height: 58 }),
  line('Orders', { x: 380, y: 153, width: 160, height: 49 }),
  line('Past items', { x: 112, y: 261, width: 234, height: 46 }),
  line('Past orders', { x: 563, y: 257, width: 252, height: 54 }),
  line('Shoppers Drug Mart', { x: 210, y: 382, width: 368, height: 46 }),
  line('Mar15·$60.54·1item', { x: 213, y: 435, width: 344, height: 36 }),
  line('SHOPPERS', { x: 23, y: 468, width: 168, height: 48 }),
  line('Sample Item One', { x: 214, y: 483, width: 350, height: 34 }),
  line('View store', { x: 688, y: 473, width: 178, height: 38, conf: 0.97 }),
  line('Sample Item Two', { x: 211, y: 525, width: 410, height: 36, conf: 0.98 }),
  line('LCBO', { x: 206, y: 657, width: 121, height: 48 }),
  line('LCBO', { x: 36, y: 722, width: 141, height: 53 }),
  line('Mar 14 ·$22.42·1 item', { x: 213, y: 714, width: 338, height: 36, conf: 0.98 }),
  line('View store', { x: 688, y: 729, width: 179, height: 41, conf: 0.97 }),
  line('IN-STORE PRICE', { x: 101, y: 767, width: 83, height: 24, conf: 0.95 }),
  line('Sample Item Three', { x: 214, y: 762, width: 345, height: 35 }),
  line('Food Basics', { x: 210, y: 896, width: 225, height: 43 }),
  line('Bases', { x: 37, y: 961, width: 144, height: 74, conf: 0.46 }),
  line('Dec 18· $76.33 · 23 item s', { x: 211, y: 949, width: 378, height: 38, conf: 0.94 }),
  line('Sample Item Four', { x: 214, y: 997, width: 338, height: 35 }),
  line('View store', { x: 688, y: 988, width: 178, height: 37 }),
  line('Popeyes', { x: 209, y: 1174, width: 166, height: 48 }),
  line('26', { x: 86, y: 1222, width: 104, height: 43, conf: 0.21 }),
  line('OGOWE', { x: 25, y: 1246, width: 168, height: 53, conf: 0.72 }),
  line('Dec 16 · $25.98 · 2 item s', { x: 213, y: 1229, width: 359, height: 36, conf: 0.95 }),
  line('View store', { x: 688, y: 1243, width: 178, height: 42 }),
  line('Sample Combo', { x: 210, y: 1275, width: 349, height: 38 }),
  line('Papa John\'s Pizza', { x: 210, y: 1412, width: 318, height: 43 }),
  line('PAN', { x: 89, y: 1435, width: 113, height: 78 }),
  line('Dec 15 · $33.24 • 2 items', { x: 211, y: 1465, width: 361, height: 36, conf: 0.93 }),
  line('View store', { x: 688, y: 1464, width: 178, height: 37 }),
  line('Sample Pizza', { x: 211, y: 1516, width: 254, height: 36 }),
  line('A&W', { x: 206, y: 1610, width: 112, height: 48 }),
  line('ME', { x: 40, y: 1669, width: 48, height: 29, conf: 0.7 }),
  line('Dec 15·$20.38 · 2 items', { x: 211, y: 1666, width: 361, height: 36, conf: 0.96 }),
  line('View store', { x: 688, y: 1681, width: 178, height: 41, conf: 0.99 }),
  line('Sample Burger', { x: 210, y: 1713, width: 342, height: 41 }),
  line('Q Search', { x: 368, y: 1838, width: 187, height: 48, conf: 0.98 }),
];
export const UBER_EATS_IMAGE: ImageSize = { width: 920, height: 2000 };

// WeChat Pay's Transactions list: a "2026/9" month header with ¥ totals, then
// per transaction a description with the signed amount on the right and
// "9/13 20:23" beneath. Amounts carry no currency, and the model tacks stray
// characters onto some ("+150.00.", "+4.801"). Boxes and amounts are the
// shipped model's output for a real screenshot (2026-09-17); the names are not.
export const wechatPayLines = (): OcrLine[] => [
  line('10:32', { x: 88, y: 51, width: 165, height: 46 }),
  line('X', { x: 8, y: 141, width: 104, height: 78, conf: 0.92 }),
  line('Transactions', { x: 336, y: 156, width: 248, height: 42 }),
  line('All Transactions', { x: 55, y: 289, width: 283, height: 37 }),
  line('Q Search', { x: 412, y: 283, width: 176, height: 47, conf: 0.93 }),
  line('Statistics >', { x: 710, y: 289, width: 182, height: 37, conf: 0.95 }),
  line('2026/9', { x: 25, y: 427, width: 241, height: 48 }),
  line('Expenditures¥485.00 Incomes¥485.00i', { x: 250, y: 432, width: 641, height: 37, conf: 0.97 }),
  line('微信红包-来自张三', { x: 174, y: 553, width: 379, height: 47 }),
  line('+120.00', { x: 733, y: 555, width: 166, height: 47, conf: 0.9 }),
  line('9/13 20:23', { x: 174, y: 617, width: 176, height: 41 }),
  line('转账-转给李四', { x: 174, y: 739, width: 303, height: 43 }),
  line('-485.00', { x: 731, y: 738, width: 163, height: 47 }),
  line('4.', { x: 78, y: 816, width: 38, height: 30, conf: 0.56 }),
  line('9/5 10:37', { x: 172, y: 799, width: 162, height: 43 }),
  line('位', { x: 41, y: 934, width: 101, height: 71, conf: 0.29 }),
  line('零钱通转出-到零钱', { x: 176, y: 922, width: 339, height: 42 }),
  line('56.26', { x: 771, y: 920, width: 129, height: 49 }),
  line('9/5 10:36', { x: 173, y: 983, width: 161, height: 42 }),
  line('转账-来自张三', { x: 176, y: 1105, width: 301, height: 43 }),
  line('+215.00', { x: 733, y: 1104, width: 166, height: 48 }),
  line('9/2 18:48', { x: 173, y: 1166, width: 161, height: 41 }),
  line('转账-来自张三', { x: 174, y: 1287, width: 303, height: 43 }),
  line('+150.00.', { x: 733, y: 1287, width: 166, height: 48, conf: 0.91 }),
  line('9/1 14:25', { x: 172, y: 1348, width: 156, height: 43 }),
  line('2026/8', { x: 24, y: 1473, width: 189, height: 48 }),
  line('Expenditures¥0.00 Incomes¥4.80', { x: 326, y: 1476, width: 565, height: 41, conf: 0.98 }),
  line('微信红包-来自爸爸', { x: 176, y: 1601, width: 340, height: 43 }),
  line('+4.801', { x: 770, y: 1600, width: 130, height: 49, conf: 0.98 }),
  line('10—', { x: 60, y: 1630, width: 62, height: 38, conf: 0.47 }),
  line('8/2 07:21', { x: 172, y: 1662, width: 158, height: 43, conf: 0.95 }),
  line('2026/7', { x: 24, y: 1786, width: 186, height: 49 }),
  line('Expenditures¥26.98 Incomes¥139.80 1', { x: 277, y: 1789, width: 615, height: 42, conf: 0.96 }),
  line('转账-来自王五Sam', { x: 174, y: 1914, width: 399, height: 47 }),
  line('+110.001', { x: 737, y: 1914, width: 163, height: 49, conf: 0.96 }),
  line('7/15.18:36', { x: 176, y: 1976, width: 168, height: 24, conf: 0.96 }),
];
export const WECHAT_IMAGE: ImageSize = { width: 920, height: 2000 };
