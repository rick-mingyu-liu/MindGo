const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { groupRows } = require('../services/import/rows');
const { parseUberActivity, splitDateTime } = require('../services/import/uberActivity');
const { classifyLayout } = require('../services/import/classify');
const { parseOcr } = require('../services/import/parse');
const { line, at, uberActivityLines, UBER_IMAGE, bankScreenshot, receiptPhoto } = require('./helpers/ocrLayouts');

/**
 * Uber's Activity screen: one card per trip, the destination stacked over a
 * date-and-time line and the fare. Everything else on the screen — the map's
 * street names, the status bar, the Rate and Rebook buttons — must not become
 * a transaction or part of one.
 */
const TODAY = '2026-09-17';

describe('splitDateTime', () => {
  for (const [input, day] of [
    ['Sep 16 • 7:16 p.m .', '2026-09-16'],
    ['Aug 21 • 12:53 p.m.', '2026-08-21'],
    ['Sep 14 · 4:03 PM', '2026-09-14'],
    ['Yesterday • 9:02 a.m.', '2026-09-16'],
    ['Dec 30, 2025 • 11:40 p.m.', '2025-12-30'],
  ]) {
    test(`reads ${input}`, () => assert.equal(splitDateTime(input, TODAY).day, day));
  }

  for (const input of ['Sep 16', 'Rebook', '7:16 p.m.', 'Canceled • $0.00', '']) {
    test(`rejects ${JSON.stringify(input)}`, () => assert.equal(splitDateTime(input, TODAY), null));
  }
});

describe('parseUberActivity', () => {
  test('reads every trip with its date, fare and destination', () => {
    const { drafts } = parseUberActivity(groupRows(uberActivityLines()), TODAY);
    assert.deepEqual(drafts.map((d) => [d.date, d.amount, d.type, d.description, d.category]), [
      ['2026-09-16', '7.53', 'expense', 'Uber: Noodle House', 'Transportation'],
      ['2026-09-16', '10.38', 'expense', 'Uber: Riverside Clinic', 'Transportation'],
      ['2026-09-14', '9.96', 'expense', 'Uber: Riverside Clinic', 'Transportation'],
      ['2026-08-29', '11.89', 'expense', 'Uber: Golden Lotus Chinese Seafood Cuisine', 'Transportation'],
      ['2026-08-21', '8.40', 'expense', 'Uber: Lakeside Park', 'Transportation'],
    ]);
  });

  test('the layout fixes the direction, so no row is a guess', () => {
    const { drafts } = parseUberActivity(groupRows(uberActivityLines()), TODAY);
    assert.ok(drafts.every((d) => d.flags.length === 0), JSON.stringify(drafts.map((d) => d.flags)));
  });

  test('a fare with no date line above it is not a trip', () => {
    const { drafts } = parseUberActivity(groupRows([
      line('Somewhere', { y: at(0) }),
      line('$5.00', { y: at(1) }),
    ]), TODAY);
    assert.deepEqual(drafts, []);
  });

  test('a canceled trip at $0.00 is skipped', () => {
    const { drafts } = parseUberActivity(groupRows([
      line('Somewhere', { y: at(0) }),
      line('Sep 12 • 8:00 a.m.', { y: at(0) + 45 }),
      line('$0.00', { y: at(0) + 90 }),
    ]), TODAY);
    assert.deepEqual(drafts, []);
  });
});

describe('classifyLayout with Uber', () => {
  test('recognises the Activity screen', () => {
    const result = classifyLayout(groupRows(uberActivityLines()), TODAY);
    assert.equal(result.layout, 'uber-activity');
    assert.ok(result.confidence >= 0.6, `confidence ${result.confidence}`);
  });

  test('leaves bank lists and receipts where they were', () => {
    assert.equal(classifyLayout(bankScreenshot(), TODAY).layout, 'bank-list');
    assert.equal(classifyLayout(receiptPhoto(), TODAY).layout, 'receipt');
  });
});

test('parseOcr returns the trips, confident and categorised', () => {
  const result = parseOcr({ lines: uberActivityLines(), image: UBER_IMAGE, today: TODAY });
  assert.equal(result.layout, 'uber-activity');
  assert.equal(result.needsFallback, false);
  assert.equal(result.rows.length, 5);
  for (const row of result.rows) {
    assert.equal(row.category, 'Transportation');
    assert.deepEqual(row.flags, []);
    assert.ok(row.boxes.length >= 3, 'boxes cover destination, date and fare');
  }
});
