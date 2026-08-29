const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db/connection');

/**
 * `DELETE /transactions/auto-delete` deletes rows and cannot be undone, and it
 * took an unvalidated `months` off the query string. Item 20:
 *
 *   ?months=0   cutoff = today          -> the caller's whole history
 *   ?months=-6  cutoff six months ahead -> everything, future rows included
 *   ?months=    threw in toISOString()  -> 500
 *
 * The last one is the one that looks safe: `const { months = 4 }` defaults only
 * on `undefined`, so an empty value is `''`, not `4`.
 *
 * These run the **real router** on a real server rather than the validation
 * chain on its own, because the failure being guarded against is "the validator
 * exists but is not mounted" — which a unit test of the chain would pass.
 *
 * The load-bearing assertion in every rejection case is that `db.query` was
 * never called: a 400 that still deleted the rows would be worse than the bug.
 */

const authPath = require.resolve('../middleware/auth');
const routerPath = require.resolve('../routes/transactions');

let server;
let baseUrl;
let queries;

before(async () => {
  // The router applies auth at module load, so it is replaced before the
  // require rather than mocked afterwards.
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => { req.user = { userId: 7 }; next(); },
  };
  delete require.cache[routerPath];

  const app = express();
  app.use(express.json());
  app.use('/transactions', require(routerPath));

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete require.cache[authPath];
  delete require.cache[routerPath];
});

beforeEach(() => {
  queries = [];
  mock.method(db, 'query', async (text, params) => {
    queries.push({ text, params });
    return { rowCount: 0, rows: [] };
  });
});

afterEach(() => mock.restoreAll());

const del = (qs) => fetch(`${baseUrl}/transactions/auto-delete${qs}`, { method: 'DELETE' });

describe('DELETE /transactions/auto-delete', () => {
  describe('rejects a months it cannot honour, without touching the table', () => {
    for (const [label, qs] of [
      ['zero — the cutoff would be today', '?months=0'],
      ['negative — the cutoff would be in the future', '?months=-6'],
      ['empty — the default does not apply to it', '?months='],
      ['not a number', '?months=abc'],
      ['fractional', '?months=1.5'],
      ['past the 60 the settings API allows', '?months=61'],
      ['absurd, which used to throw', '?months=999999999'],
    ]) {
      test(label, async () => {
        const res = await del(qs);
        assert.equal(res.status, 400, `${qs} was not rejected`);
        assert.equal(queries.length, 0, `${qs} reached the database`);

        const body = await res.json();
        assert.match(JSON.stringify(body), /months must be a whole number between 1 and 60/);
      });
    }
  });

  describe('accepts what it should', () => {
    test('a value in range deletes below the right cutoff', async () => {
      const res = await del('?months=4');
      assert.equal(res.status, 200);
      assert.equal(queries.length, 1);

      const { text, params } = queries[0];
      assert.match(text, /^DELETE FROM transactions WHERE user_id = \$1 AND date < \$2$/);
      assert.equal(params[0], 7);

      const expected = new Date();
      expected.setMonth(expected.getMonth() - 4);
      assert.equal(params[1], expected.toISOString().split('T')[0]);
    });

    test('no parameter at all falls back to four months', async () => {
      const res = await del('');
      assert.equal(res.status, 200);
      assert.equal(queries.length, 1);
    });

    test('the boundary values 1 and 60 are allowed', async () => {
      for (const months of [1, 60]) {
        queries = [];
        assert.equal((await del(`?months=${months}`)).status, 200, `months=${months}`);
        assert.equal(queries.length, 1);
      }
    });
  });
});
