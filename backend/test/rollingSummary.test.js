const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db/connection');
const { boundsOf, currentTerm, previousTerm } = require('../utils/terms');

/**
 * `/summary/rolling?term=` — the term-aligned window.
 *
 * The bug it fixes: a rolling four months is not a term. Counting back from
 * today, the window equals the term only in April, August and December — the
 * last month of each, when it is already over. In the *first* month of a co-op
 * term, which is when someone actually sets a budget, three quarters of the
 * window is the previous term's money. See IMPROVEMENTS.md item 20.
 *
 * Runs the real router on a real server, like autoDeleteValidation.test.js: the
 * assertions are about which SQL bounds the request produces, and a test of the
 * controller in isolation would not notice a validator that was never mounted.
 */

const authPath = require.resolve('../middleware/auth');
const routerPath = require.resolve('../routes/summary');

let server;
let baseUrl;
let queries;
let savedTZ;

before(async () => {
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
  savedTZ = process.env.TZ;
});

after(async () => {
  process.env.TZ = savedTZ;
  await new Promise((resolve) => server.close(resolve));
  delete require.cache[authPath];
  delete require.cache[routerPath];
});

beforeEach(() => {
  queries = [];
  // Every row is CAD and the default target is CAD, so no rate lookup happens
  // and this test never touches the network.
  mock.method(db, 'query', async (text, params) => {
    queries.push({ text, params });
    return { rows: [], rowCount: 0 };
  });
});

afterEach(() => mock.restoreAll());

const get = (qs) => fetch(`${baseUrl}/summary/rolling${qs}`);
const boundsUsed = () => ({ start: queries[0].params[1], end: queries[0].params[2] });

describe('GET /summary/rolling?term=', () => {
  test('an explicit term selects exactly that term', async () => {
    const res = await get('?term=2026-spring');
    assert.equal(res.status, 200);
    assert.deepEqual(boundsUsed(), { start: '2026-05-01', end: '2026-09-01' });
  });

  test('the window is half-open, so September is not in Spring', async () => {
    // The whole point of [start, end): consecutive terms share a boundary and
    // nothing is double-counted or dropped between them.
    await get('?term=2026-spring');
    const spring = boundsUsed();
    queries = [];
    await get('?term=2026-fall');
    assert.equal(spring.end, boundsUsed().start);
  });

  test('Fall runs into January of the next year', async () => {
    await get('?term=2026-fall');
    assert.deepEqual(boundsUsed(), { start: '2026-09-01', end: '2027-01-01' });
  });

  test('current resolves without the client knowing the calendar', async () => {
    await get('?term=current');
    assert.deepEqual(boundsUsed(), boundsOf(currentTerm(new Date())));
  });

  test('previous is the term before it, not four months ago', async () => {
    // This is the comparison a co-op budget is actually for.
    await get('?term=previous');
    assert.deepEqual(boundsUsed(), boundsOf(previousTerm(currentTerm(new Date()))));
  });

  test('the response says which window it served', async () => {
    // So a client never computes a date or a term name, and so a bug report
    // says which window was served — `months=4` does not tell you which four.
    const body = await (await get('?term=2026-spring')).json();
    assert.equal(body.term, '2026-spring');
    assert.equal(body.termLabel, 'Spring 2026');
    assert.equal(body.period, 'Spring 2026');
    assert.equal(body.startDate, '2026-05-01');
    assert.equal(body.endDate, '2026-09-01');
  });

  describe('rejects a term it cannot resolve, without querying', () => {
    for (const qs of ['?term=2026-summer', '?term=', '?term=spring-2026', '?term=2026', '?term=CURRENT']) {
      test(qs || '(empty)', async () => {
        const res = await get(qs);
        assert.equal(res.status, 400, `${qs} was not rejected`);
        assert.equal(queries.length, 0, `${qs} reached the database`);
        assert.match(JSON.stringify(await res.json()), /term must be current, previous, or an id/);
      });
    }
  });

  test('term and months together are a client bug, not a preference', async () => {
    const res = await get('?term=current&months=4');
    assert.equal(res.status, 400);
    assert.equal(queries.length, 0);
    assert.match(JSON.stringify(await res.json()), /either term or months, not both/);
  });
});

describe('GET /summary/rolling?months= still works', () => {
  test('a month count is unchanged in meaning', async () => {
    const res = await get('?months=4');
    assert.equal(res.status, 200);
    const { start, end } = boundsUsed();
    assert.match(start, /^\d{4}-\d{2}-01$/);
    assert.match(end, /^\d{4}-\d{2}-01$/);
  });

  test('no parameter at all still means four months', async () => {
    assert.equal((await get('')).status, 200);
    const { start, end } = boundsUsed();
    assert.match(start, /^\d{4}-\d{2}-01$/);
    assert.match(end, /^\d{4}-\d{2}-01$/);
  });

  test('the response marks it as rolling, with no term', async () => {
    const body = await (await get('?months=4')).json();
    assert.equal(body.period, '4-month rolling');
    assert.equal(body.term, null);
    assert.equal(body.termLabel, null);
  });

  test('months is now validated here too', async () => {
    for (const qs of ['?months=0', '?months=-6', '?months=abc', '?months=61', '?months=']) {
      queries = [];
      assert.equal((await get(qs)).status, 400, `${qs} was accepted`);
      assert.equal(queries.length, 0);
    }
  });
});

describe('window boundaries do not drift with the process timezone', () => {
  // The regression this pins: the window used to be built with
  // `new Date(y, m, 1).toISOString().split('T')[0]`, which yields '2026-04-30'
  // for May 1 under TZ=Asia/Shanghai. Every boundary shifted back a day and a
  // day's transactions landed in the wrong month. It escaped only because the
  // server runs UTC.
  for (const tz of ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
    test(`first-of-month boundaries under TZ=${tz}`, async () => {
      process.env.TZ = tz;

      queries = [];
      await get('?months=4');
      const rolling = boundsUsed();
      assert.match(rolling.start, /-01$/, `start drifted under ${tz}: ${rolling.start}`);
      assert.match(rolling.end, /-01$/, `end drifted under ${tz}: ${rolling.end}`);

      queries = [];
      await get('?term=2026-spring');
      assert.deepEqual(boundsUsed(), { start: '2026-05-01', end: '2026-09-01' });
    });
  }
});
