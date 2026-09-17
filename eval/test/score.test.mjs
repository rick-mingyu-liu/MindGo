import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { similarity, matchRows, scoreImage, sumCounts, rates } = require('../lib/score.cjs');

const row = (overrides = {}) => ({
  date: '2026-09-14', amount: '23.47', type: 'expense', description: 'SOBEYS',
  category: 'Groceries', flags: [], source: 'parser', ...overrides,
});
const truth = (overrides = {}) => {
  const { flags: _f, source: _s, ...rest } = row(overrides);
  return rest;
};

describe('similarity', () => {
  test('is 1 for text that differs only in case and punctuation', () => {
    assert.equal(similarity('SOBEYS #1234', 'sobeys 1234'), 1);
  });
  test('is high for a one-letter OCR slip and low for a different merchant', () => {
    assert.ok(similarity('SOBEYS #1234', 'S0BEYS #1234') > 0.6);
    assert.ok(similarity('SOBEYS', 'NETFLIX') < 0.2);
  });
});

describe('matchRows', () => {
  test('pairs a misread amount by its description', () => {
    const { pairs, extra, missed } = matchRows([row({ amount: '28.47' })], [truth()]);
    assert.equal(pairs.length, 1);
    assert.deepEqual([extra, missed], [[], []]);
  });

  test('does not pair unrelated rows', () => {
    const { pairs, extra, missed } = matchRows(
      [row({ amount: '1.00', description: 'NETFLIX' })], [truth()]
    );
    assert.equal(pairs.length, 0);
    assert.equal(extra.length, 1);
    assert.equal(missed.length, 1);
  });

  test('uses each predicted row once', () => {
    const { pairs } = matchRows([row()], [truth(), truth()]);
    assert.equal(pairs.length, 1);
  });
});

describe('scoreImage', () => {
  test('a wrong amount with no warning is a silent error', () => {
    const { counts } = scoreImage([row({ amount: '28.47' })], [truth()]);
    assert.equal(counts.amountErrors, 1);
    assert.equal(counts.silentAmountErrors, 1);
  });

  test('a wrong amount that was flagged is not silent', () => {
    const { counts } = scoreImage([row({ amount: '28.47', flags: ['low_confidence'] })], [truth()]);
    assert.equal(counts.amountErrors, 1);
    assert.equal(counts.silentAmountErrors, 0);
  });

  test('informational flags do not excuse an error', () => {
    const { counts } = scoreImage(
      [row({ type: 'income', flags: ['arithmetic_verified', 'pending'] })], [truth()]
    );
    assert.equal(counts.silentTypeErrors, 1);
  });

  test('an unflagged row that is not in the screenshot is counted', () => {
    const { counts } = scoreImage([row(), row({ description: 'GHOST', amount: '9.99' })], [truth()]);
    assert.equal(counts.silentExtraRows, 1);
  });

  test('rates over summed images', () => {
    const a = scoreImage([row()], [truth()]).counts;
    const b = scoreImage([row({ amount: '1.00' })], [truth(), truth({ description: 'X', amount: '2.00' })]).counts;
    const r = rates(sumCounts([a, b]));
    assert.equal(r.recall, 2 / 3);
    assert.equal(r.amountExact, 1 / 2);
    assert.equal(r.silentAmountErrorRate, 1 / 2);
  });
});
