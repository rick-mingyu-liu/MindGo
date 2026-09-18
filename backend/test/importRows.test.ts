import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupRows } from '../services/import/rows';
import { line, at } from './helpers/ocrLayouts';

/**
 * OCR returns loose text boxes; the parser works on visual rows. These pin how
 * boxes are grouped, because a box put on the wrong row pairs a merchant with
 * someone else's amount.
 */
describe('groupRows', () => {
  test('puts boxes on the same visual line into one row, left to right', () => {
    const rows = groupRows([
      line('-$23.47', { x: 600, y: at(1) + 3 }),
      line('SOBEYS #1234', { y: at(1) }),
      line('Sep 14', { y: at(0) }),
    ]);
    assert.deepEqual(rows.map((r) => r.text), ['Sep 14', 'SOBEYS #1234 -$23.47']);
    assert.equal(rows[1]!.lines[0]!.text, 'SOBEYS #1234');
  });

  test('keeps rows apart when boxes barely touch', () => {
    const rows = groupRows([line('A', { y: 0, height: 40 }), line('B', { y: 30, height: 40 })]);
    assert.equal(rows.length, 2);
  });

  test('a tall box between two lines does not chain them into one row', () => {
    // A chevron spanning an amount and the balance beneath it (measured).
    const rows = groupRows([
      line('ALEX', { y: 511, height: 47 }),
      line('$32.00', { x: 896, y: 501, height: 62 }),
      line('√', { x: 1036, y: 533, height: 90 }),
      line('SAMPLE PERSON', { y: 588, height: 46 }),
      line('$3,016.15', { x: 838, y: 580, height: 56 }),
    ]);
    assert.equal(rows[0]!.text, 'ALEX $32.00');
    assert.ok(rows.every((r) => !(r.text.includes('$32.00') && r.text.includes('$3,016.15'))),
      rows.map((r) => r.text).join(' | '));
  });

  test('drops a lone symbol the model made of an icon', () => {
    const rows = groupRows([
      line('凸', { x: 50, y: 923, width: 90, height: 78, conf: 0.96 }),
      line('©', { x: 52, y: 1456, width: 86, height: 60 }),
      line('Pho', { x: 164, y: 930, height: 55 }),
    ]);
    assert.deepEqual(rows.map((r) => r.text), ['Pho']);
  });

  test('keeps a lone letter, digit, sign or currency symbol', () => {
    const rows = groupRows(['A', '7', '-', '$', '¥'].map((text, i) => line(text, { y: at(i) })));
    assert.equal(rows.length, 5);
  });

  test('reads a row spanning two lines top line first, whatever their x', () => {
    const rows = groupRows([
      line('Corner Bakery', { x: 164, y: 905, height: 45 }),
      line('$45.03', { x: 897, y: 900, height: 100 }),
      line('Annex', { x: 163, y: 955, height: 45 }),
    ]);
    assert.deepEqual(rows.map((r) => r.text), ['Corner Bakery $45.03 Annex']);
  });

  test('takes the lowest confidence of a row, and ignores blank lines', () => {
    const rows = groupRows([line('A', { conf: 0.9 }), line('B', { x: 300, conf: 0.6 }), line('  ')]);
    assert.equal(rows.length, 1);
    assert.equal(rows[0]!.conf, 0.6);
  });

  test('handles no input', () => {
    assert.deepEqual(groupRows(undefined), []);
  });
});
