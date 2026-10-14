import { test, describe, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import db = require('../db/connection');
import exchangeRateService = require('../services/exchangeRateService');
import { termSummary, CONVERSION_NOTE } from '../services/moneyFacts';

/**
 * termSummary's pace: this term's spending so far against what the previous
 * term had actually spent in its own first as many days. With `db.query`
 * stubbed and `now` fixed, what must hold:
 *
 *   - the comparison window is the previous term's first N days, N counting
 *     today, clamped to that term's end — asserted as the exact SQL params;
 *   - front-loaded spending (tuition) is compared as spent, not prorated;
 *   - no ratio, and a note saying why, when the comparison spent nothing;
 *   - the same `now` gives the same windows in every timezone.
 */

interface Row {
  currency: string;
  type: string;
  category: string;
  total: string;
}

let calls: unknown[][];
/** Rows answered per `start|end` window. */
let rows: Record<string, Row[]>;

beforeEach(() => {
  calls = [];
  rows = {};
  mock.method(db, 'query', async (_text: string, params: unknown[]) => {
    calls.push(params);
    const found = rows[`${String(params[1])}|${String(params[2])}`] ?? [];
    return { rowCount: found.length, rows: found };
  });
  mock.method(exchangeRateService, 'getExchangeRate', async () => 1);
});

afterEach(() => mock.restoreAll());

const spend = (total: number, category = 'Food'): Row[] => [{ currency: 'CAD', type: 'expense', category, total: String(total) }];
/** Local noon on a calendar day: the same day in every zone the sweep below uses. */
const noon = (year: number, month: number, day: number): Date => new Date(year, month - 1, day, 12);

async function pace(now: Date) {
  const out = await termSummary(7, 'current', now);
  assert.ok(out.pace);
  // Whole term, then this term so far, then the comparison window.
  assert.equal(calls.length, 3);
  return { out, pace: out.pace };
}

describe('the comparison window', () => {
  test('early-term tuition is compared as spent, not prorated', async () => {
    // Spring 2026, day 10, against Winter 2026, which paid 6000 of tuition in
    // its first ten days. A prorated share would have expected far less.
    rows['2026-05-01|2026-05-11'] = spend(1200);
    rows['2026-01-01|2026-01-11'] = [...spend(6000, 'Education'), ...spend(400)];
    const { pace: p } = await pace(noon(2026, 5, 10));

    assert.deepEqual(calls[1], [7, '2026-05-01', '2026-05-11']);
    assert.deepEqual(calls[2], [7, '2026-01-01', '2026-01-11']);
    assert.deepEqual(p.current_window, { start: '2026-05-01', end_exclusive: '2026-05-11', days: 10 });
    assert.deepEqual(p.comparison_window, { start: '2026-01-01', end_exclusive: '2026-01-11', days: 10, clamped: false });
    assert.equal(p.current_spending, 1200);
    assert.equal(p.last_term_same_point, 6400);
    assert.equal(p.ratio, 0.19);
    assert.equal(p.compared_with, 'Winter 2026');
    assert.equal(p.note, undefined);
    assert.match(p.caveat, /co-op/);
  });

  test('day 1 compares one day with one day', async () => {
    await pace(noon(2026, 9, 1));
    assert.deepEqual(calls[1], [7, '2026-09-01', '2026-09-02']);
    assert.deepEqual(calls[2], [7, '2026-05-01', '2026-05-02']);
  });

  test('Fall day 122 against Spring (123 days) is not clamped', async () => {
    const { pace: p } = await pace(noon(2026, 12, 31));
    assert.deepEqual(calls[1], [7, '2026-09-01', '2027-01-01']);
    assert.deepEqual(calls[2], [7, '2026-05-01', '2026-08-31']);
    assert.equal(p.current_window.days, 122);
    assert.deepEqual(p.comparison_window, { start: '2026-05-01', end_exclusive: '2026-08-31', days: 122, clamped: false });
  });

  test('leap Winter day 121 against Fall (122 days) is not clamped', async () => {
    const { pace: p } = await pace(noon(2028, 4, 30));
    assert.deepEqual(calls[1], [7, '2028-01-01', '2028-05-01']);
    assert.deepEqual(calls[2], [7, '2027-09-01', '2027-12-31']);
    assert.equal(p.current_window.days, 121);
    assert.equal(p.comparison_window.clamped, false);
  });

  test('Spring past day 120 against a 120-day Winter is clamped to the whole of Winter', async () => {
    rows['2026-05-01|2026-08-31'] = spend(3000);
    rows['2026-01-01|2026-05-01'] = spend(6000);
    const { pace: p } = await pace(noon(2026, 8, 30));
    assert.deepEqual(calls[2], [7, '2026-01-01', '2026-05-01']);
    assert.equal(p.current_window.days, 122);
    assert.deepEqual(p.comparison_window, { start: '2026-01-01', end_exclusive: '2026-05-01', days: 120, clamped: true });
    assert.equal(p.ratio, 0.5);
    assert.match(p.note ?? '', /all of Winter 2026/);
  });

  test('day 120 of Spring against a 120-day Winter is the whole term, but not clamped', async () => {
    const { pace: p } = await pace(noon(2026, 8, 28));
    assert.deepEqual(calls[2], [7, '2026-01-01', '2026-05-01']);
    assert.equal(p.comparison_window.clamped, false);
  });

  test('Winter 2027 compares with Fall 2026 across the year boundary', async () => {
    const { pace: p } = await pace(noon(2027, 1, 15));
    assert.deepEqual(calls[0], [7, '2027-01-01', '2027-05-01']);
    assert.deepEqual(calls[1], [7, '2027-01-01', '2027-01-16']);
    assert.deepEqual(calls[2], [7, '2026-09-01', '2026-09-16']);
    assert.equal(p.compared_with, 'Fall 2026');
  });

  test('a transaction dated later this term is not counted as spent so far', async () => {
    rows['2026-09-01|2027-01-01'] = spend(900);
    rows['2026-09-01|2026-10-15'] = spend(300);
    rows['2026-05-01|2026-06-14'] = spend(600);
    const { out, pace: p } = await pace(noon(2026, 10, 14));
    assert.equal(out.expenses, 900);
    assert.equal(p.current_spending, 300);
    assert.equal(p.ratio, 0.5);
  });
});

describe('nothing to compare with', () => {
  test('no transactions at all: no ratio, and a note saying so', async () => {
    const { out, pace: p } = await pace(noon(2026, 10, 14));
    assert.equal(out.expenses, 0);
    assert.equal(out.savings_rate, null);
    assert.equal(p.current_spending, 0);
    assert.equal(p.last_term_same_point, 0);
    assert.equal(p.ratio, null);
    assert.match(p.note ?? '', /nothing to compare/);
  });

  test('spending now but none last term: ratio null, never Infinity', async () => {
    rows['2026-09-01|2026-10-15'] = spend(500);
    const { pace: p } = await pace(noon(2026, 10, 14));
    assert.equal(p.ratio, null);
    assert.match(p.note ?? '', /No spending recorded in the same window of Spring 2026/);
    // And it serialises as null, not as something JSON cannot carry.
    assert.equal(JSON.parse(JSON.stringify(p)).ratio, null);
  });

  test('no spending now against some last term is a ratio of 0', async () => {
    rows['2026-05-01|2026-06-14'] = spend(600);
    const { pace: p } = await pace(noon(2026, 10, 14));
    assert.equal(p.ratio, 0);
    assert.equal(p.note, undefined);
  });
});

test('the previous term has no pace and runs one query', async () => {
  const out = await termSummary(7, 'previous', noon(2026, 10, 14));
  assert.equal(out.pace, null);
  assert.deepEqual(calls, [[7, '2026-05-01', '2026-09-01']]);
});

test('the summary says conversion uses current rates', async () => {
  const out = await termSummary(7, 'current', noon(2026, 10, 14));
  assert.equal(out.currency_note, CONVERSION_NOTE);
  assert.match(CONVERSION_NOTE, /current exchange rates/);
});

describe('windows do not depend on the process timezone', () => {
  // `today` is the process's local day, as for currentTerm and toDay
  // everywhere else; the window arithmetic after it must not move. Node
  // applies a change to process.env.TZ to Dates created after it, so the
  // sweep runs in-process, as in terms.test.ts.
  const saved = process.env.TZ;
  after(() => { process.env.TZ = saved; });

  for (const tz of ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Auckland']) {
    test(`same windows under TZ=${tz}`, async () => {
      process.env.TZ = tz;
      const { pace: p } = await pace(noon(2027, 1, 15));
      assert.deepEqual(calls[1], [7, '2027-01-01', '2027-01-16']);
      assert.deepEqual(calls[2], [7, '2026-09-01', '2026-09-16']);
      assert.equal(p.current_window.days, 15);
    });
  }

  test('one instant is the local day it is in that zone', async () => {
    // 2026-12-31T20:00Z is still Fall in Toronto and already Winter in Auckland.
    const instant = '2026-12-31T20:00:00Z';
    process.env.TZ = 'America/Toronto';
    const toronto = await pace(new Date(instant));
    assert.equal(toronto.out.term, '2026-fall');
    assert.deepEqual(calls[2], [7, '2026-05-01', '2026-08-31']);

    calls = [];
    process.env.TZ = 'Pacific/Auckland';
    const auckland = await pace(new Date(instant));
    assert.equal(auckland.out.term, '2027-winter');
    assert.deepEqual(calls[2], [7, '2026-09-01', '2026-09-02']);
  });
});
