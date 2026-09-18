import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupRows } from '../services/import/rows';
import { parseUberEatsOrders, splitOrderLine } from '../services/import/uberEats';
import { classifyLayout } from '../services/import/classify';
import { parseOcr } from '../services/import/parse';
import {
  line, uberEatsOrderLines, UBER_EATS_IMAGE, uberActivityLines, bankScreenshot, receiptPhoto,
} from './helpers/ocrLayouts';

/**
 * Uber Eats' Past orders tab: one order per store name, dated and priced on
 * the line beneath it. Store logos are read as text beside those lines and
 * must not leak into a description.
 */
const TODAY = '2026-09-17';

describe('splitOrderLine', () => {
  for (const [input, day, amount] of [
    ['Mar15·$60.54·1item', '2026-03-15', '60.54'],
    ['Mar 14 ·$22.42·1 item', '2026-03-14', '22.42'],
    ['Dec 18· $76.33 · 23 item s', '2025-12-18', '76.33'],
    ['Dec 15 · $33.24 • 2 items', '2025-12-15', '33.24'],
  ]) {
    test(`reads ${input}`, () => {
      const order = splitOrderLine(input, TODAY);
      assert.equal(order!.day, day);
      assert.equal(order!.amount.value, amount);
    });
  }

  for (const input of ['Dec 10 · Canceled · 2 items', 'Sep 16 • 7:16 p.m.', 'Mar 15 · $60.54', 'Popeyes', '']) {
    test(`rejects ${JSON.stringify(input)}`, () => assert.equal(splitOrderLine(input, TODAY), null));
  }
});

describe('parseUberEatsOrders', () => {
  test('reads every order with its store, date and total', () => {
    const { drafts } = parseUberEatsOrders(groupRows(uberEatsOrderLines()), TODAY);
    assert.deepEqual(drafts.map((d) => [d.date, d.amount, d.type, d.description, d.category]), [
      ['2026-03-15', '60.54', 'expense', 'Uber Eats: Shoppers Drug Mart', 'Healthcare'],
      ['2026-03-14', '22.42', 'expense', 'Uber Eats: LCBO', null],
      ['2025-12-18', '76.33', 'expense', 'Uber Eats: Food Basics', 'Groceries'],
      ['2025-12-16', '25.98', 'expense', 'Uber Eats: Popeyes', 'Dining Out'],
      ['2025-12-15', '33.24', 'expense', "Uber Eats: Papa John's Pizza", 'Dining Out'],
      ['2025-12-15', '20.38', 'expense', 'Uber Eats: A&W', 'Dining Out'],
    ]);
    assert.ok(drafts.every((d) => d.flags.length === 0), JSON.stringify(drafts.map((d) => d.flags)));
  });

  test('an order line with no store above it keeps the order', () => {
    const { drafts } = parseUberEatsOrders(groupRows([
      line('Dec 15 · $20.38 · 2 items', { x: 211, y: 500, height: 36 }),
    ]), TODAY);
    assert.deepEqual(drafts.map((d) => [d.amount, d.description]), [['20.38', 'Uber Eats']]);
  });
});

describe('classifyLayout with Uber Eats', () => {
  test('recognises the Past orders tab', () => {
    const result = classifyLayout(groupRows(uberEatsOrderLines()), TODAY);
    assert.equal(result.layout, 'uber-eats-orders');
    assert.ok(result.confidence >= 0.6, `confidence ${result.confidence}`);
  });

  test('the Past items tab is not an order list, whatever its tab labels say', () => {
    // Today's menu prices, no dates: nothing on it is a charge.
    const rows = groupRows([
      line('Orders', { y: 150 }),
      line('Past items', { x: 112, y: 260 }), line('Past orders', { x: 563, y: 260 }),
      line('$18.99', { y: 350 }),
      line("Papa John's Pizza", { x: 183, y: 500 }),
      line('$20.39·230 Cal.', { y: 1010 }), line('$18.69·210 Cal.', { x: 312, y: 1010 }),
    ]);
    assert.notEqual(classifyLayout(rows, TODAY).layout, 'uber-eats-orders');
  });

  test('leaves the other layouts where they were', () => {
    assert.equal(classifyLayout(groupRows(uberActivityLines()), TODAY).layout, 'uber-activity');
    assert.equal(classifyLayout(bankScreenshot(), TODAY).layout, 'bank-list');
    assert.equal(classifyLayout(receiptPhoto(), TODAY).layout, 'receipt');
  });
});

test('parseOcr returns the orders, confident', () => {
  const result = parseOcr({ lines: uberEatsOrderLines(), image: UBER_EATS_IMAGE, today: TODAY });
  assert.equal(result.layout, 'uber-eats-orders');
  assert.equal(result.needsFallback, false);
  assert.equal(result.rows.length, 6);
  assert.equal(result.rows[1]!.category, null, 'no keyword, no guess');
  assert.ok(result.rows.every((r) => r.flags.length === 0));
});
