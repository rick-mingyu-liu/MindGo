import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import db = require('../db/connection');

/**
 * `GET /transactions` used to take page and limit unvalidated: any limit was
 * honoured (no upper bound) and ?page=0 made a negative OFFSET. The real
 * router is mounted so that a validator which exists but is not mounted fails
 * here; every rejection must also leave db.query untouched.
 */

const authPath = require.resolve('../middleware/auth');
const routerPath = require.resolve('../routes/transactions');

interface Query {
  text: string;
  params: unknown[];
}

let server: Server;
let baseUrl: string;
let queries: Query[];

before(async () => {
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = { userId: 7 }; next(); },
  } as NodeJS.Module;
  delete require.cache[routerPath];

  const app = express();
  app.use(express.json());
  app.use('/transactions', require(routerPath));

  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a bound TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  delete require.cache[authPath];
  delete require.cache[routerPath];
});

beforeEach(() => {
  queries = [];
  mock.method(db, 'query', async (text: string, params: unknown[]) => {
    queries.push({ text, params });
    return text.startsWith('SELECT COUNT') ? { rowCount: 1, rows: [{ count: '0' }] } : { rowCount: 0, rows: [] };
  });
});

afterEach(() => mock.restoreAll());

const get = (qs: string) => fetch(`${baseUrl}/transactions${qs}`);

describe('GET /transactions paging', () => {
  describe('rejects page and limit it cannot honour, without touching the table', () => {
    const cases: [string, string, RegExp][] = [
      ['limit above 200', '?limit=201', /limit must be a whole number between 1 and 200/],
      ['limit zero', '?limit=0', /limit must be a whole number between 1 and 200/],
      ['limit not a number', '?limit=abc', /limit must be a whole number between 1 and 200/],
      ['limit empty', '?limit=', /limit must be a whole number between 1 and 200/],
      ['limit fractional', '?limit=1.5', /limit must be a whole number between 1 and 200/],
      ['page zero', '?page=0', /page must be a whole number of at least 1/],
      ['page negative', '?page=-1', /page must be a whole number of at least 1/],
      ['page not a number', '?page=abc', /page must be a whole number of at least 1/],
    ];
    for (const [label, qs, message] of cases) {
      test(label, async () => {
        const res = await get(qs);
        assert.equal(res.status, 400, `${qs} was not rejected`);
        assert.equal(queries.length, 0, `${qs} reached the database`);
        assert.match(JSON.stringify(await res.json()), message);
      });
    }
  });

  describe('accepts what it should', () => {
    test('limit 200 is the largest page and reaches the query as LIMIT 200', async () => {
      const res = await get('?limit=200&page=3');
      assert.equal(res.status, 200);
      const { text, params } = queries[0]!;
      assert.match(text, /LIMIT \$\d+ OFFSET \$\d+$/);
      assert.deepEqual(params.slice(-2), [200, 400]);
    });

    test('no parameters means page 1 of 50', async () => {
      const res = await get('');
      assert.equal(res.status, 200);
      assert.deepEqual(queries[0]!.params.slice(-2), [50, 0]);
    });

    test('limit 1 is allowed', async () => {
      assert.equal((await get('?limit=1')).status, 200);
    });
  });
});
