import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { parseOcr } from '../services/import/parse';
import {
  TODAY, line, at, bankScreenshot, receiptPhoto, RECEIPT_IMAGE, stackedBalanceLines, STACKED_IMAGE,
  iconListLines, ICON_IMAGE,
} from './helpers/ocrLayouts';
import type { ImageSize, OcrLine } from '../types/import';

/**
 * The whole parser: confidence, flags, and when it asks for the fallback.
 */
describe('parseOcr', () => {
  const run = (lines: OcrLine[], image: ImageSize = { width: 800, height: 900 }) =>
    parseOcr({ lines, image, today: TODAY });

  test('no text is a warning, not a failure', () => {
    assert.deepEqual(run([]), {
      layout: 'unknown', layoutConfidence: 0, rows: [], warnings: ['no_text_found'],
      unparsedLines: [], needsFallback: false,
    });
  });

  test('a receipt comes back as one confident, categorised row', () => {
    const result = parseOcr({ lines: receiptPhoto().flatMap((r) => r.lines), image: RECEIPT_IMAGE, today: TODAY });
    assert.equal(result.layout, 'receipt');
    assert.equal(result.needsFallback, false);
    assert.deepEqual(result.rows, [{
      date: '2026-09-14',
      amount: '7.67',
      currency: 'CAD',
      description: 'SOBEYS',
      category: 'Groceries',
      type: 'expense',
      confidence: 0.99,
      flags: ['arithmetic_verified'],
      source: 'parser',
      boxes: result.rows[0]!.boxes,
    }]);
    assert.equal(result.rows[0]!.boxes.length, 2);
  });

  test('a stacked bank list with chevrons comes back as its two transactions', () => {
    const result = parseOcr({ lines: stackedBalanceLines(), image: STACKED_IMAGE, today: '2026-09-17' });
    assert.equal(result.layout, 'bank-list');
    assert.equal(result.needsFallback, false);
    assert.deepEqual(result.rows.map((r) => [r.date, r.amount, r.type]), [
      ['2026-09-16', '25.00', 'expense'],
      ['2026-09-15', '32.00', 'expense'],
    ]);
  });

  test('icons read as characters stay out of descriptions and confidence', () => {
    const result = parseOcr({ lines: iconListLines(), image: ICON_IMAGE, today: '2026-09-17' });
    assert.equal(result.layout, 'bank-list');
    assert.deepEqual(result.rows.map((r) => [r.date, r.amount, r.type, r.description]), [
      ['2026-09-16', '46.84', 'expense', 'Noodle House'],
      ['2026-09-15', '100.00', 'income', 'CAD Deposit'],
      ['2026-09-14', '45.03', 'expense', 'Sq *Corner Bakery Annex'],
      ['2026-09-14', '9.96', 'expense', 'Uber Canada/Ubertrip'],
      ['2026-09-14', '100.00', 'income', 'CAD Deposit'],
    ]);
    assert.ok(result.rows.every((r) => !r.flags.includes('low_confidence')),
      JSON.stringify(result.rows.map((r) => r.flags)));
  });

  test('low OCR confidence is flagged at the threshold', () => {
    const result = run([line('Sep 14', { y: at(0) }), line('SOBEYS', { y: at(1) }),
      line('-$23.47', { x: 600, y: at(1), conf: 0.7 }),
      line('A', { y: at(2) }), line('-$1.00', { x: 600, y: at(2) }),
      line('B', { y: at(3) }), line('-$2.00', { x: 600, y: at(3) })]);
    const sobeys = result.rows.find((r) => r.description === 'SOBEYS');
    assert.equal(sobeys!.confidence, 0.7);
    assert.ok(sobeys!.flags.includes('low_confidence'));
    const a = result.rows.find((r) => r.description === 'A');
    assert.ok(!a!.flags.includes('low_confidence'));
  });

  test('an inferred year and a guessed type lower confidence without dropping it below 0.8', () => {
    const result = run(bankScreenshot().flatMap((r) => r.lines));
    const tim = result.rows.find((r) => r.description === 'TIM HORTONS');
    assert.equal(tim!.confidence, 0.89);
    assert.ok(!tim!.flags.includes('low_confidence'));
  });

  test('nothing parseable asks for the fallback and returns the text for manual entry', () => {
    const result = run([line('hello'), line('world', { y: at(1) })]);
    assert.equal(result.needsFallback, true);
    assert.deepEqual(result.rows, []);
    assert.deepEqual(result.unparsedLines, ['hello', 'world']);
  });

  test('a receipt that does not add up asks for the fallback', () => {
    const rows = receiptPhoto();
    rows.find((r) => r.text.startsWith('TOTAL'))!.lines[1]!.text = '7.87';
    const result = parseOcr({ lines: rows.flatMap((r) => r.lines), image: RECEIPT_IMAGE, today: TODAY });
    assert.equal(result.needsFallback, true);
    assert.equal(result.rows.length, 1);
  });
});
