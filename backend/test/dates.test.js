const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const { types } = require('pg');
const db = require('../db/connection');
const { toDay, monthOf, formatDay, monthSpan } = require('../utils/dates');
const aiController = require('../controllers/aiController');

/**
 * A DATE column is a calendar day. Everything here exists because the code
 * used to treat one as an instant.
 *
 * The symptom the user saw: the transactions list showed every date one day
 * early. The cause is two conversions, each individually reasonable:
 *
 *   1. node-pg parses DATE into a JS Date at the *server's* local midnight.
 *   2. res.json() serialises that Date through toISOString(), i.e. in UTC.
 *
 * So one stored day leaves the server as a different string per host, and a
 * browser that renders it with `new Date(...)` subtracts the viewer's offset
 * again. Under Render (UTC) + a Toronto viewer that is exactly one day.
 */

describe('the DATE type parser', () => {
  test('hands back the stored day, not a Date', () => {
    // Registered as a side effect of loading db/connection, which the require
    // at the top of this file has already done. No pool is opened: it is lazy.
    const parse = types.getTypeParser(types.builtins.DATE);
    assert.equal(parse('2026-08-28'), '2026-08-28');
    assert.equal(typeof parse('2026-08-28'), 'string');
  });

  test('is the same string whatever timezone the server runs in', () => {
    const parse = types.getTypeParser(types.builtins.DATE);
    const saved = process.env.TZ;
    const seen = new Set();
    for (const tz of ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      seen.add(JSON.parse(JSON.stringify({ d: parse('2026-08-28') })).d);
    }
    process.env.TZ = saved;
    // Before the parser this set held three different strings, one of which
    // ('2026-08-27T16:00:00.000Z') names the wrong day outright.
    assert.deepEqual([...seen], ['2026-08-28']);
  });
});

describe('toDay', () => {
  test('passes a day string through', () => {
    assert.equal(toDay('2026-08-28'), '2026-08-28');
  });

  test('takes the day out of a timestamp, for rows served before the parser', () => {
    assert.equal(toDay('2026-08-28T00:00:00.000Z'), '2026-08-28');
  });

  test('reads a Date with local getters, so it names the day the server has', () => {
    const saved = process.env.TZ;
    process.env.TZ = 'America/Toronto';
    // 2026-08-29T01:00Z is still the 28th in Toronto. toISOString() would say
    // the 29th; the server's own calendar says the 28th, and that is the one
    // a query bound has to use.
    assert.equal(toDay(new Date('2026-08-29T01:00:00.000Z')), '2026-08-28');
    process.env.TZ = saved;
  });

  test('returns null rather than a wrong day for what it cannot read', () => {
    for (const bad of [null, undefined, '', 'today', new Date('nonsense'), 42]) {
      assert.equal(toDay(bad), null, `expected null for ${String(bad)}`);
    }
  });
});

describe('monthOf', () => {
  test('is the month the day is written in', () => {
    assert.equal(monthOf('2026-08-28'), '2026-08');
  });

  test('files the first of the month under that month', () => {
    // The regression a naive fix introduces: once the wire carries a plain
    // '2026-08-01', `new Date(...)` parses it as UTC midnight and .getMonth()
    // answers July for every reader west of UTC. A whole month of a user's
    // first-of-month rent lands in the month before.
    const saved = process.env.TZ;
    for (const tz of ['UTC', 'America/Toronto', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      assert.equal(monthOf('2026-08-01'), '2026-08', `wrong under ${tz}`);
      assert.equal(monthOf('2026-12-31'), '2026-12', `wrong under ${tz}`);
    }
    process.env.TZ = saved;
  });

  test('is null when there is no day', () => {
    assert.equal(monthOf(null), null);
  });
});

describe('formatDay', () => {
  test('prints the stored day, in the shape the reports already used', () => {
    assert.equal(formatDay('2026-08-28'), '8/28/2026');
    assert.equal(formatDay('2026-01-05'), '1/5/2026');
  });

  test('does not shift the day in any timezone', () => {
    const saved = process.env.TZ;
    for (const tz of ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      assert.equal(formatDay('2026-08-01'), '8/1/2026', `shifted under ${tz}`);
    }
    process.env.TZ = saved;
  });

  test('falls back rather than printing "Invalid Date" into an email', () => {
    assert.equal(formatDay(null), '-');
    assert.equal(formatDay(undefined, ''), '');
  });
});

describe('monthSpan', () => {
  test('counts both ends', () => {
    assert.equal(monthSpan('2026-08', '2026-08'), 1);
    assert.equal(monthSpan('2026-05', '2026-08'), 4);
  });

  test('crosses a year boundary', () => {
    assert.equal(monthSpan('2025-11', '2026-02'), 4);
    assert.equal(monthSpan('2024-01', '2026-01'), 25);
  });
});

describe('getMonthCount', () => {
  test('counts the months a set of transactions spans', () => {
    assert.equal(aiController.getMonthCount([
      { date: '2026-08-28' }, { date: '2026-05-01' }, { date: '2026-07-15' },
    ]), 4);
  });

  test('is 1 for a single month, and 0 for nothing', () => {
    assert.equal(aiController.getMonthCount([{ date: '2026-08-28' }, { date: '2026-08-01' }]), 1);
    assert.equal(aiController.getMonthCount([]), 0);
  });

  test('does not lose a month to the first of the month', () => {
    // The divisor of every "average monthly spend" the planner produces. One
    // month too many understates the average and the plan built on it.
    const saved = process.env.TZ;
    process.env.TZ = 'America/Toronto';
    assert.equal(aiController.getMonthCount([{ date: '2026-06-01' }, { date: '2026-08-01' }]), 3);
    process.env.TZ = saved;
  });
});

/**
 * The grouping the dashboard's month chart is built from, through the real
 * router. Asserted on the response rather than on the helper, because the
 * defect this guards against lives in the controller's use of it.
 */
describe('monthlyBreakdown keys', () => {
  const authPath = require.resolve('../middleware/auth');
  const routerPath = require.resolve('../routes/summary');
  let server;
  let baseUrl;
  let savedTZ;

  const rows = [
    { id: 1, type: 'expense', amount: '100.00', currency: 'CAD', category: 'Rent', date: '2026-06-01' },
    { id: 2, type: 'income', amount: '50.00', currency: 'CAD', category: 'Salary', date: '2026-07-31' },
    { id: 3, type: 'expense', amount: '25.00', currency: 'CAD', category: 'Food', date: '2026-08-15' },
  ];

  before(async () => {
    savedTZ = process.env.TZ;
    require.cache[authPath] = {
      id: authPath,
      filename: authPath,
      loaded: true,
      exports: (req, _res, next) => { req.user = { userId: 7 }; next(); },
    };
    delete require.cache[routerPath];

    const app = express();
    app.use('/summary', require(routerPath));
    server = app.listen(0);
    await new Promise((resolve) => server.once('listening', resolve));
    baseUrl = `http://127.0.0.1:${server.address().port}`;
  });

  after(async () => {
    process.env.TZ = savedTZ;
    await new Promise((resolve) => server.close(resolve));
    delete require.cache[authPath];
    delete require.cache[routerPath];
  });

  beforeEach(() => {
    // Every row is CAD and the default target is CAD, so no rate is looked up
    // and this never touches the network.
    mock.method(db, 'query', async () => ({ rows, rowCount: rows.length }));
  });

  afterEach(() => mock.restoreAll());

  for (const tz of ['UTC', 'America/Toronto', 'Pacific/Kiritimati']) {
    test(`files each transaction under its own month (TZ=${tz})`, async () => {
      process.env.TZ = tz;
      const res = await fetch(`${baseUrl}/summary/rolling?term=2026-spring`);
      assert.equal(res.status, 200);
      const body = await res.json();
      assert.deepEqual(
        body.monthlyBreakdown.map((m) => m.month),
        ['2026-06', '2026-07', '2026-08'],
      );
    });
  }

  test('the row dated the first of the month is not filed under May', async () => {
    process.env.TZ = 'America/Toronto';
    const res = await fetch(`${baseUrl}/summary/rolling?term=2026-spring`);
    const body = await res.json();
    const june = body.monthlyBreakdown.find((m) => m.month === '2026-06');
    assert.ok(june, 'the 2026-06-01 row went missing from June');
    assert.equal(june.expenses, 100);
    assert.equal(body.monthlyBreakdown.some((m) => m.month === '2026-05'), false);
  });
});
