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
let rows: Record<string, unknown>[];

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
  rows = [];
  mock.method(db, 'query', async (text: string, params: unknown[]) => {
    queries.push({ text, params });
    return text.startsWith('SELECT COUNT') ? { rowCount: 1, rows: [{ count: '0' }] } : { rowCount: rows.length, rows };
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
      ['page zero', '?page=0', /page must be a whole number between 1 and 1000000/],
      ['page negative', '?page=-1', /page must be a whole number between 1 and 1000000/],
      ['page not a number', '?page=abc', /page must be a whole number between 1 and 1000000/],
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
      assert.deepEqual(params.slice(-2), [201, 400]);
    });

    test('no parameters means page 1 of 50', async () => {
      const res = await get('');
      assert.equal(res.status, 200);
      assert.deepEqual(queries[0]!.params.slice(-2), [51, 0]);
    });

    test('limit 1 is allowed', async () => {
      assert.equal((await get('?limit=1')).status, 200);
    });

    test("'+5' and '05' are accepted and bind consistently", async () => {
      for (const qs of ['?limit=05', '?limit=%2B5']) {
        queries = [];
        assert.equal((await get(qs)).status, 200, qs);
        assert.equal(queries[0]!.params.at(-2), 6, qs);
      }
      queries = [];
      assert.equal((await get('?page=%2B2&limit=10')).status, 200);
      assert.deepEqual(queries[0]!.params.slice(-2), [11, 10]);
    });
  });

  describe('repeated and oversized parameters', () => {
    for (const qs of ['?page=1&page=2', '?limit=5&limit=6', `?before=${cursor('2026-08-01', 5)}&before=${cursor('2026-08-01', 4)}`, '?page=1000001']) {
      test(qs.slice(0, 40), async () => {
        assert.equal((await get(qs)).status, 400);
        assert.equal(queries.length, 0);
      });
    }
    test('page 1000000 is the ceiling', async () => {
      assert.equal((await get('?page=1000000&limit=1')).status, 200);
    });
  });
});

function cursor(date: string, id: number | string): string {
  return Buffer.from(`${date}|${id}`).toString('base64url');
}

describe('GET /transactions ordering and keyset paging', () => {
  test('orders by date DESC, id DESC', async () => {
    await get('');
    assert.match(queries[0]!.text, /ORDER BY date DESC, id DESC LIMIT/);
  });

  test('a cursor adds the keyset predicate, binds date and id, and ignores page', async () => {
    const res = await get(`?before=${cursor('2026-08-01', 42)}&page=3&limit=10`);
    assert.equal(res.status, 200);
    const { text, params } = queries[0]!;
    assert.match(text, /AND \(date, id\) < \(\$2::date, \$3\)/);
    assert.deepEqual(params, [7, '2026-08-01', 42, 11, 0]);
  });

  test('no cursor, no keyset predicate', async () => {
    await get('');
    assert.doesNotMatch(queries[0]!.text, /\(date, id\) </);
  });

  describe('forged or malformed cursors never reach the database', () => {
    const bad: [string, string][] = [
      ['not base64 of a pair', 'abc'],
      ['impossible day', cursor('2026-02-31', 5)],
      ['id zero', cursor('2026-08-01', 0)],
      ['id negative', cursor('2026-08-01', -3)],
      ['id with a suffix', cursor('2026-08-01', '5; DROP')],
      ['id past int range', cursor('2026-08-01', 99999999999)],
      ['leading-zero id', cursor('2026-08-01', '05')],
      ['timestamp instead of day', cursor('2026-08-01T00:00:00Z', 5)],
      ['padded base64', Buffer.from('2026-08-01|42').toString('base64')],
      ['empty', ''],
    ];
    for (const [label, value] of bad) {
      test(label, async () => {
        const res = await get(`?before=${encodeURIComponent(value)}`);
        assert.equal(res.status, 400);
        assert.equal(queries.length, 0);
      });
    }
  });

  test('nextCursor exists only when a row beyond the page does; the extra row is dropped', async () => {
    rows = [
      { id: 9, date: '2026-08-03', amount: '1.00', currency: 'CAD' },
      { id: 4, date: '2026-08-02', amount: '2.00', currency: 'CAD' },
      { id: 2, date: '2026-08-01', amount: '3.00', currency: 'CAD' },
    ];
    const more = await (await get('?limit=2')).json() as { nextCursor: string | null; transactions: unknown[] };
    assert.equal(more.nextCursor, cursor('2026-08-02', 4));
    assert.equal(more.transactions.length, 2);

    // Exactly a full last page: no extra row, so no cursor to an empty page.
    const exact = await (await get('?limit=3')).json() as { nextCursor: string | null; transactions: unknown[] };
    assert.equal(exact.nextCursor, null);
    assert.equal(exact.transactions.length, 3);
  });

  test('pagination.page is reported without a cursor and omitted with one', async () => {
    const plain = await (await get('?page=2&limit=5')).json() as { pagination: Record<string, unknown> };
    assert.equal(plain.pagination.page, 2);
    const keyed = await (await get(`?before=${cursor('2026-08-01', 3)}&limit=5`)).json() as { pagination: Record<string, unknown> };
    assert.equal('page' in keyed.pagination, false);
  });
});

describe('PUT and DELETE /transactions/:id', () => {
  test('a malformed id is a 400 before db.query', async () => {
    for (const id of ['abc', '0', '-1']) {
      const del = await fetch(`${baseUrl}/transactions/${id}`, { method: 'DELETE' });
      assert.equal(del.status, 400, `DELETE ${id}`);
      const put = await fetch(`${baseUrl}/transactions/${id}`, {
        method: 'PUT',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ amount: 1, description: 'd', category: 'c', type: 'expense', date: '2026-08-01', currency: 'CAD' }),
      });
      assert.equal(put.status, 400, `PUT ${id}`);
    }
    assert.equal(queries.length, 0);
  });
});

describe('GET /transactions/:id', () => {
  test('returns the row, looked up by id and the caller', async () => {
    rows = [{ id: 12, description: 'x' }];
    const res = await get('/12');
    assert.equal(res.status, 200);
    assert.deepEqual(queries[0]!.params, ['12', 7]);
    assert.match(queries[0]!.text, /WHERE id = \$1 AND user_id = \$2/);
  });

  test("another user's id is a 404 (user_id bound, nothing found)", async () => {
    const res = await get('/13');
    assert.equal(res.status, 404);
    assert.equal(queries[0]!.params[1], 7);
  });

  for (const id of ['0', '-1', 'abc', '1.5', '99999999999']) {
    test(`invalid id ${id} is a 400 before db.query`, async () => {
      assert.equal((await get(`/${id}`)).status, 400);
      assert.equal(queries.length, 0);
    });
  }

  test('literal routes are not shadowed', async () => {
    await get('/categories');
    assert.doesNotMatch(queries[0]!.text, /WHERE id = \$1/);
  });
});
