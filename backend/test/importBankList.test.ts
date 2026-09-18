import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupRows } from '../services/import/rows';
import { parseBankList } from '../services/import/bankList';
import { parseOcr } from '../services/import/parse';
import {
  TODAY, line, at, bankScreenshot, stackedBalanceLines, iconListLines,
} from './helpers/ocrLayouts';
import type { ParserDraft } from '../types/import';

/**
 * Bank-app transaction lists. OCR can drop a minus sign without lowering its
 * confidence, so the rules about direction are the ones that matter most here.
 */
describe('parseBankList', () => {
  const byDescription = (drafts: ParserDraft[]): Record<string, ParserDraft> =>
    Object.fromEntries(drafts.map((d) => [d.description, d]));

  test('reads each row with its header date and sign', () => {
    const drafts = byDescription(parseBankList(bankScreenshot(), TODAY).drafts);
    assert.deepEqual(Object.keys(drafts), ['SOBEYS #1234', 'Payroll Deposit', 'TIM HORTONS']);

    assert.equal(drafts['SOBEYS #1234']!.date, '2026-09-14');
    assert.equal(drafts['SOBEYS #1234']!.amount, '23.47');
    assert.equal(drafts['SOBEYS #1234']!.type, 'expense');
    assert.deepEqual(drafts['SOBEYS #1234']!.flags, []);

    assert.equal(drafts['Payroll Deposit']!.type, 'income');
    assert.equal(drafts['Payroll Deposit']!.amount, '1250.00');
  });

  test('an unsigned amount is a guess, never a confirmed expense', () => {
    const tim = byDescription(parseBankList(bankScreenshot(), TODAY).drafts)['TIM HORTONS'];
    assert.equal(tim!.date, '2026-09-12');
    assert.equal(tim!.type, 'expense');
    assert.ok(tim!.flags.includes('type_guessed'));
    assert.ok(tim!.flags.includes('pending'));
  });

  test('income words make an unsigned amount a guessed income', () => {
    const [draft] = parseBankList(groupRows([
      line('Sep 1 E-TRANSFER RECEIVED'), line('$40.00', { x: 600 }),
    ]), TODAY).drafts;
    assert.equal(draft!.type, 'income');
    assert.equal(draft!.date, '2026-09-01');
    assert.deepEqual(draft!.flags, ['type_guessed']);
  });

  test('an unreadable header ends the previous date instead of extending it', () => {
    const { drafts } = parseBankList(groupRows([
      line('Today', { y: at(0) }),
      line('SOBEYS', { y: at(1) }), line('-$1.00', { x: 600, y: at(1) }),
      line('Yer', { y: at(2) }),
      line('NETFLIX', { y: at(3) }), line('-$2.00', { x: 600, y: at(3) }),
    ]), TODAY);
    assert.equal(drafts[0]!.date, TODAY);
    assert.equal(drafts[1]!.date, null);
    assert.ok(drafts[1]!.flags.includes('missing_date'));
  });

  test('a title above the first transaction does not end the first header', () => {
    const { drafts } = parseBankList(groupRows([
      line('Sep 14', { y: at(0) }),
      line('Chequing account', { y: at(1) }),
      line('SOBEYS', { y: at(2) }), line('-$1.00', { x: 600, y: at(2) }),
    ]), TODAY);
    assert.equal(drafts[0]!.date, '2026-09-14');
  });

  test('a row with no date anywhere is flagged', () => {
    const [draft] = parseBankList(groupRows([line('SOBEYS'), line('-$1.00', { x: 600 })]), TODAY).drafts;
    assert.equal(draft!.date, null);
    assert.ok(draft!.flags.includes('missing_date'));
  });

  test('skips zero amounts and rows without an amount', () => {
    const { drafts } = parseBankList(groupRows([
      line('Sep 14', { y: at(0) }),
      line('Card verification', { y: at(1) }), line('$0.00', { x: 600, y: at(1) }),
      line('Available credit', { y: at(2) }),
    ]), TODAY);
    assert.deepEqual(drafts, []);
  });

  describe('running balance', () => {
    // Newest first: each balance is the one before it plus the transaction.
    const withBalances = (rows: [string, string, string][]) => groupRows(rows.flatMap(([text, amount, balance], i) => [
      line(`Sep ${14 - i} ${text}`, { y: at(i) }),
      line(amount, { x: 500, y: at(i) }),
      line(balance, { x: 650, y: at(i) }),
    ]));

    test('verifies amounts, and leaves an unsigned direction a guess', () => {
      const { drafts } = parseBankList(withBalances([
        ['PAYROLL', '$1,000.00', '$1,976.53'],
        ['SOBEYS', '$23.47', '$976.53'],
        ['OPENING', '$5.00', '$1,000.00'],
      ]), TODAY);
      assert.equal(drafts[0]!.type, 'income');
      assert.deepEqual(drafts[0]!.flags, ['type_guessed', 'arithmetic_verified']);
      assert.equal(drafts[1]!.type, 'expense');
      assert.deepEqual(drafts[1]!.flags, ['type_guessed', 'arithmetic_verified']);
      // The oldest row has nothing below it to check against.
      assert.deepEqual(drafts[2]!.flags, ['type_guessed']);
    });

    test('verifies a credit card list, whose balance rises with purchases', () => {
      const { drafts } = parseBankList(withBalances([
        ['SOBEYS', '-$23.47', '$523.47'],
        ['NETFLIX', '-$16.99', '$500.00'],
        ['OPENING', '-$1.00', '$483.01'],
      ]), TODAY);
      assert.equal(drafts[0]!.type, 'expense');
      assert.deepEqual(drafts[0]!.flags, ['arithmetic_verified']);
      assert.deepEqual(drafts[1]!.flags, ['arithmetic_verified']);
    });

    test('flags a row the balances contradict', () => {
      const { drafts } = parseBankList(withBalances([
        ['SOBEYS', '$28.47', '$976.53'], // really 23.47
        ['PAYROLL', '$1,000.00', '$1,000.00'],
        ['OPENING', '$1,000.00', '$0.00'],
      ]), TODAY);
      assert.ok(drafts[0]!.flags.includes('balance_mismatch'));
      assert.ok(!drafts[0]!.flags.includes('arithmetic_verified'));
    });

    test('a verified amount does not make a guessed direction confident', () => {
      const result = parseOcr({
        lines: withBalances([
          ['SOBEYS', '$23.47', '$976.53'],
          ['OPENING', '$1,000.00', '$1,000.00'],
          ['EARLIER', '$1.00', '$0.00'],
        ]).flatMap((r) => r.lines),
        image: { width: 800, height: 400 },
        today: TODAY,
      });
      const sobeys = result.rows[0];
      assert.ok(sobeys!.flags.includes('arithmetic_verified'));
      assert.ok(sobeys!.flags.includes('type_guessed'));
      // Header year inferred (x0.9 on 0.99) and direction guessed (0.9): 0.891.
      assert.equal(sobeys!.confidence, 0.89);
    });

    test('works on an oldest-first list', () => {
      const { drafts } = parseBankList(withBalances([
        ['OPENING', '$1,000.00', '$1,000.00'],
        ['SOBEYS', '$23.47', '$976.53'],
        ['PAYROLL', '$1,000.00', '$1,976.53'],
      ]), TODAY);
      assert.ok(drafts[1]!.flags.includes('arithmetic_verified'));
      assert.ok(drafts[2]!.flags.includes('arithmetic_verified'));
      assert.ok(!drafts[0]!.flags.includes('arithmetic_verified'));
    });
  });

  describe('a description that wraps', () => {
    test('joins the line tucked under it instead of ending the date', () => {
      const { drafts } = parseBankList(groupRows(iconListLines()), TODAY);
      const bakery = drafts.find((d) => d.amount === '45.03');
      assert.equal(bakery!.description, 'Sq *Corner Bakery Annex');
      assert.deepEqual(drafts.slice(-2).map((d) => d.date), ['2026-09-14', '2026-09-14']);
    });

    test('a header a normal row below is still a header', () => {
      const { drafts } = parseBankList(groupRows([
        line('Sep 14', { y: at(0) }),
        line('SOBEYS', { y: at(1) }), line('$23.47', { x: 600, y: at(1) }),
        line('Sep 12', { y: at(2) }),
        line('TIM HORTONS', { y: at(3) }), line('$4.25', { x: 600, y: at(3) }),
      ]), TODAY);
      assert.deepEqual(drafts.map((d) => [d.description, d.date]),
        [['SOBEYS', '2026-09-14'], ['TIM HORTONS', '2026-09-12']]);
    });
  });

  describe('balance beneath the amount', () => {
    test('reads the second amount of an entry as its balance, not a transaction', () => {
      const { drafts } = parseBankList(groupRows(stackedBalanceLines()), TODAY);
      assert.deepEqual(drafts.map((d) => [d.date, d.amount, d.description]), [
        ['2026-09-16', '25.00', 'INTERAC ETRNSFR SENT CLINIC TORONTO 20260000001ABCDEF'],
        ['2026-09-15', '32.00', 'INTERAC ETRNSFR SENT ALEX SAMPLE PERSON'],
      ]);
      // 3,016.15 - 2,991.15 is the newer entry's 25.00.
      assert.ok(drafts[0]!.flags.includes('arithmetic_verified'), drafts[0]!.flags.join());
      assert.ok(!drafts.some((d) => d.flags.includes('balance_mismatch')));
    });

    test('right-aligned amounts a normal row apart are separate transactions', () => {
      const amount = (text: string, row: number) => line(text, { x: 760 - text.length * 16, y: at(row) });
      const { drafts } = parseBankList(groupRows([
        line('Sep 14', { y: at(0) }),
        line('SOBEYS', { y: at(1) }), amount('$23.47', 1),
        line('TIM HORTONS', { y: at(2) }), amount('$4.25', 2),
      ]), TODAY);
      assert.deepEqual(drafts.map((d) => d.amount), ['23.47', '4.25']);
    });
  });
});
