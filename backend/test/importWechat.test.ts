import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupRows } from '../services/import/rows';
import { parseWechatPay, readWechatAmount } from '../services/import/wechat';
import { classifyLayout } from '../services/import/classify';
import { parseOcr } from '../services/import/parse';
import {
  line, wechatPayLines, WECHAT_IMAGE, uberActivityLines, uberEatsOrderLines, bankScreenshot, receiptPhoto,
} from './helpers/ocrLayouts';
import type { ParserDraft } from '../types/import';

/**
 * WeChat Pay's transaction list. Amounts are yuan with no symbol, the year is
 * only in the month headers, and the model adds stray characters to amounts.
 */
const TODAY = '2026-09-17';

describe('readWechatAmount', () => {
  for (const [input, value, sign, corrected] of [
    ['+120.00', '120.00', 1, false],
    ['-485.00', '485.00', -1, false],
    ['−485.00', '485.00', -1, false],
    ['56.26', '56.26', null, false],
    ['+1,250.00', '1250.00', 1, false],
    ['+150.00.', '150.00', 1, true],
    ['+4.801', '4.80', 1, true],
    ['+110.001', '110.00', 1, true],
  ]) {
    test(`reads ${input}`, () => {
      const amount = readWechatAmount(input);
      assert.deepEqual([amount!.value, amount!.sign, amount!.corrected], [value, sign, corrected]);
    });
  }

  for (const input of ['4.8012', '+4.8', '9/13 20:23', '2026/9', 'Incomes¥4.80', '']) {
    test(`rejects ${JSON.stringify(input)}`, () => assert.equal(readWechatAmount(input), null));
  }
});

describe('parseWechatPay', () => {
  const drafts = () => parseWechatPay(groupRows(wechatPayLines()), TODAY).drafts;

  test('reads every transaction as yuan, dated from its own line and its month header', () => {
    assert.deepEqual(drafts().map((d) => [d.date, d.amount, d.currency, d.description]), [
      ['2026-09-13', '120.00', 'CNY', '微信红包-来自张三'],
      ['2026-09-05', '485.00', 'CNY', '转账-转给李四'],
      ['2026-09-05', '56.26', 'CNY', '零钱通转出-到零钱'],
      ['2026-09-02', '215.00', 'CNY', '转账-来自张三'],
      ['2026-09-01', '150.00', 'CNY', '转账-来自张三'],
      ['2026-08-02', '4.80', 'CNY', '微信红包-来自爸爸'],
      ['2026-07-15', '110.00', 'CNY', '转账-来自王五Sam'],
    ]);
  });

  test('a sign decides the direction; without one, the words guess and say so', () => {
    const byAmount: Record<string, ParserDraft> = Object.fromEntries(drafts().map((d) => [d.amount, d]));
    assert.equal(byAmount['120.00']!.type, 'income');
    assert.equal(byAmount['485.00']!.type, 'expense');
    assert.deepEqual(byAmount['485.00']!.flags, []);
    assert.equal(byAmount['56.26']!.type, 'income', '到零钱: into the wallet');
    assert.deepEqual(byAmount['56.26']!.flags, ['type_guessed']);
  });

  test('an amount repaired from a stray character is flagged', () => {
    const byAmount: Record<string, ParserDraft> = Object.fromEntries(drafts().map((d) => [d.amount, d]));
    assert.deepEqual(byAmount['4.80']!.flags, ['corrected_chars']);
    assert.ok(byAmount['4.80']!.conf.amount < 0.8);
  });

  test('an unsigned amount with words that point out is a guessed expense', () => {
    const { drafts: rows } = parseWechatPay(groupRows([
      line('2026/9', { x: 25, y: 400, height: 48 }),
      line('扫二维码付款-给某商店', { x: 174, y: 550, height: 47 }),
      line('36.00', { x: 771, y: 550, height: 47 }),
      line('9/3 12:01', { x: 174, y: 614, height: 41 }),
    ]), TODAY);
    const draft = rows[0]!;
    assert.deepEqual([draft.type, draft.flags], ['expense', ['type_guessed']]);
  });

  test('a date line grouped into the description row is still the date, not description', () => {
    // A taller amount box pulls the date line onto the row (seen in a browser run).
    const { drafts: rows } = parseWechatPay(groupRows([
      line('2026/9', { x: 25, y: 400, height: 48 }),
      line('转账-来自张三', { x: 174, y: 1287, height: 43 }),
      line('+150.00', { x: 733, y: 1287, height: 80 }),
      line('9/1 14:25', { x: 172, y: 1345, height: 43 }),
    ]), TODAY);
    const draft = rows[0]!;
    assert.equal(groupRows([
      line('转账-来自张三', { x: 174, y: 1287, height: 43 }),
      line('+150.00', { x: 733, y: 1287, height: 80 }),
      line('9/1 14:25', { x: 172, y: 1345, height: 43 }),
    ]).length, 1, 'the fixture really is one row');
    assert.deepEqual([draft.date, draft.description, draft.type], ['2026-09-01', '转账-来自张三', 'income']);
  });

  test('a transaction above any month header takes the most recent such day', () => {
    const { drafts: rows } = parseWechatPay(groupRows([
      line('转账-来自张三', { x: 174, y: 550, height: 47 }),
      line('+20.00', { x: 733, y: 550, height: 47 }),
      line('12/30 09:00', { x: 174, y: 614, height: 41 }),
    ]), TODAY);
    const draft = rows[0]!;
    assert.equal(draft.date, '2025-12-30');
    assert.ok(draft.conf.date < 1, 'an inferred year lowers date confidence');
  });

  test('an amount with no date line under its description is not a transaction', () => {
    const { drafts: found } = parseWechatPay(groupRows([
      line('2026/9', { x: 25, y: 400, height: 48 }),
      line('转账-来自张三', { x: 174, y: 550, height: 47 }),
      line('+20.00', { x: 733, y: 550, height: 47 }),
    ]), TODAY);
    assert.deepEqual(found, []);
  });
});

describe('classifyLayout with WeChat Pay', () => {
  test('recognises the transaction list', () => {
    const result = classifyLayout(groupRows(wechatPayLines()), TODAY);
    assert.equal(result.layout, 'wechat-pay');
    assert.ok(result.confidence >= 0.6, `confidence ${result.confidence}`);
  });

  test('leaves the other layouts where they were', () => {
    assert.equal(classifyLayout(groupRows(uberEatsOrderLines()), TODAY).layout, 'uber-eats-orders');
    assert.equal(classifyLayout(groupRows(uberActivityLines()), TODAY).layout, 'uber-activity');
    assert.equal(classifyLayout(bankScreenshot(), TODAY).layout, 'bank-list');
    assert.equal(classifyLayout(receiptPhoto(), TODAY).layout, 'receipt');
  });
});

test('parseOcr returns seven yuan transactions without asking for the fallback', () => {
  const result = parseOcr({ lines: wechatPayLines(), image: WECHAT_IMAGE, today: TODAY });
  assert.equal(result.layout, 'wechat-pay');
  assert.equal(result.needsFallback, false);
  assert.equal(result.rows.length, 7);
  assert.ok(result.rows.every((r) => r.currency === 'CNY'));
});
