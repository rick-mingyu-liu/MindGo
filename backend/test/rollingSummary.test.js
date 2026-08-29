const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db/connection');
const {
  boundsOf, currentTerm, previousTerm,
  yearBoundsOf, currentYear, previousYear, termsOfYear,
} = require('../utils/terms');

/**
 * `/summary/rolling?term=` — the term-aligned window.
 *
 * The bug it fixes: a rolling four months is not a term. Counting back from
 * today, the window equals the term only in April, August and December — the
 * last month of each, when it is already over. In the *first* month of a co-op
 * term, which is when someone actually sets a budget, three quarters of the
 * window is the previous term's money.
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
    // The message names both offending parameters. Asserted as a pair rather
    // than as one sentence, because `year` joined this rule later and the
    // wording had to widen to fit it.
    const body = JSON.stringify(await res.json());
    assert.match(body, /term/);
    assert.match(body, /months/);
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

describe('GET /summary/rolling?year=', () => {
  test('an explicit year is that whole calendar year', async () => {
    const res = await get('?year=2026');
    assert.equal(res.status, 200);
    assert.deepEqual(boundsUsed(), { start: '2026-01-01', end: '2027-01-01' });
  });

  test('current and previous resolve without the client knowing the date', async () => {
    await get('?year=current');
    assert.deepEqual(boundsUsed(), yearBoundsOf(currentYear(new Date())));

    queries = [];
    await get('?year=previous');
    assert.deepEqual(boundsUsed(), yearBoundsOf(previousYear(currentYear(new Date()))));
  });

  test('the year is exactly the three terms inside it', async () => {
    // The property that makes a yearly view safe to add here rather than as
    // its own month arithmetic: a year total can never disagree with the term
    // totals it contains, because they share the same boundaries.
    await get('?year=2026');
    const year = boundsUsed();
    const terms = termsOfYear('2026').map((id) => boundsOf(id));

    assert.equal(terms[0].start, year.start, 'the year starts where Winter does');
    assert.equal(terms[2].end, year.end, 'the year ends where Fall does');
    for (let i = 1; i < terms.length; i++) {
      assert.equal(terms[i - 1].end, terms[i].start, 'the terms tile without a gap');
    }
  });

  test('the response says it served a year, and names it', async () => {
    const body = await (await get('?year=2026')).json();
    assert.equal(body.year, '2026');
    assert.equal(body.term, null);
    assert.equal(body.periodLabel, '2026');
    assert.equal(body.period, '2026');
    assert.equal(body.startDate, '2026-01-01');
    assert.equal(body.endDate, '2027-01-01');
  });

  test('a term response reports no year, so the two are never confused', async () => {
    const body = await (await get('?term=2026-spring')).json();
    assert.equal(body.year, null);
    assert.equal(body.term, '2026-spring');
  });

  describe('rejects a year it cannot resolve, without querying', () => {
    for (const qs of ['?year=', '?year=26', '?year=20260', '?year=2026-spring', '?year=CURRENT', '?year=abcd']) {
      test(qs, async () => {
        queries = [];
        const res = await get(qs);
        assert.equal(res.status, 400, `${qs} was not rejected`);
        assert.equal(queries.length, 0, `${qs} reached the database`);
        assert.match(JSON.stringify(await res.json()), /year must be current, previous, or a four-digit year/);
      });
    }
  });

  test('year boundaries do not drift with the process timezone', async () => {
    const saved = process.env.TZ;
    for (const tz of ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
      process.env.TZ = tz;
      queries = [];
      await get('?year=2026');
      assert.deepEqual(boundsUsed(), { start: '2026-01-01', end: '2027-01-01' }, `drifted under ${tz}`);
    }
    process.env.TZ = saved;
  });
});

describe('the three windows are mutually exclusive', () => {
  // A request naming more than one is a client bug. Answering it with any
  // single interpretation would hide that, and the caller would quietly get a
  // window it did not ask for.
  for (const qs of ['?term=current&months=4', '?year=2026&months=4', '?term=current&year=2026',
                    '?term=current&year=2026&months=4']) {
    test(qs, async () => {
      queries = [];
      const res = await get(qs);
      assert.equal(res.status, 400, `${qs} was accepted`);
      assert.equal(queries.length, 0, `${qs} reached the database`);
      assert.match(JSON.stringify(await res.json()), /pass one of term, year or months/);
    });
  }

  test('any one of them alone is fine', async () => {
    for (const qs of ['?term=current', '?year=current', '?months=4', '']) {
      assert.equal((await get(qs)).status, 200, `${qs} was rejected`);
    }
  });
});
