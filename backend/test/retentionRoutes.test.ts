import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import db = require('../db/connection');
import * as retentionService from '../services/retentionService';
import { boundsOf, lastNTerms } from '../utils/terms';

/**
 * Settings -> Automatic deletion, through the real transactions router:
 *
 *   GET /transactions/retention-settings   the stored setting
 *   PUT /transactions/retention-settings   { retentionTerms: 3|6|9|12|null }
 *   GET /transactions/retention-preview    ?terms=N -> what it would delete now
 *
 * The real router on a real server, not the validation chains alone, because
 * the failure being guarded against is a validator that exists but is not
 * mounted. The load-bearing assertion in every rejection is that `db.query`
 * was never called.
 *
 * The previous GET answered a hard-coded "off" and the PUT answered "updated
 * successfully" while storing nothing. `DELETE /transactions/auto-delete`,
 * which nothing called and which counted months rather than terms, is gone.
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
let columnPresent: boolean;
let isDemo: boolean;
let stored: number | null;

before(async () => {
  // The router applies auth at module load, so it is replaced before the
  // require rather than mocked afterwards.
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
  columnPresent = true;
  isDemo = false;
  stored = null;
  retentionService.resetRetentionProbe();
  mock.method(db, 'query', async (text: string, params: unknown[] = []) => {
    queries.push({ text, params });
    if (text.includes('information_schema.columns')) return { rowCount: 1, rows: [{ present: columnPresent }] };
    if (text.startsWith('SELECT transaction_retention_terms')) return { rowCount: 1, rows: [{ terms: stored, is_demo: isDemo }] };
    if (text.startsWith('UPDATE users')) {
      const terms = params[0] as number | null;
      if (terms !== null && isDemo) return { rowCount: 0, rows: [] };
      stored = terms;
      return { rowCount: 1, rows: [{ terms, is_demo: isDemo }] };
    }
    if (text.startsWith('SELECT count(*)')) return { rowCount: 1, rows: [{ count: 41 }] };
    return { rowCount: 0, rows: [] };
  });
});

afterEach(() => mock.restoreAll());

const put = (body: unknown) => fetch(`${baseUrl}/transactions/retention-settings`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});
interface Answer {
  available: boolean;
  retentionTerms: number | null;
  choices: number[];
  window: { cutoff: string; keepFromTerm: string } | null;
  message?: string;
  code?: string;
}
const json = async (res: Response): Promise<Answer> => (await res.json()) as Answer;
const writes = () => queries.filter((q) => !q.text.startsWith('SELECT'));

describe('PUT /transactions/retention-settings', () => {
  describe('rejects anything but an offered choice or null, without touching the database', () => {
    const cases: [string, unknown][] = [
      ['missing', {}],
      ['a string', { retentionTerms: '6' }],
      ['a number not offered', { retentionTerms: 5 }],
      ['one term, which would keep only the current term', { retentionTerms: 1 }],
      ['zero', { retentionTerms: 0 }],
      ['negative', { retentionTerms: -3 }],
      ['fractional', { retentionTerms: 6.5 }],
      ['past the largest choice', { retentionTerms: 15 }],
      ['a boolean', { retentionTerms: true }],
      ['an array', { retentionTerms: [6] }],
    ];
    for (const [label, body] of cases) {
      test(label, async () => {
        const res = await put(body);
        assert.equal(res.status, 400, `${JSON.stringify(body)} was not rejected`);
        assert.equal(queries.length, 0, `${JSON.stringify(body)} reached the database`);
      });
    }
  });

  test('stores a choice for the signed-in user and answers what was stored', async () => {
    const res = await put({ retentionTerms: 6 });
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const update = queries.find((q) => q.text.startsWith('UPDATE users'))!;
    assert.match(update.text, /SET transaction_retention_terms = \$1/);
    assert.match(update.text, /WHERE id = \$2/);
    assert.deepEqual(update.params, [6, 7]);
    const body = await json(res);
    assert.equal(body.available, true);
    assert.equal(body.retentionTerms, 6);
    assert.equal(body.window?.cutoff, boundsOf(lastNTerms(6)[0]!).start);
    assert.equal(body.message, undefined, 'a success message without a stored value is what this replaced');
  });

  test('null turns it off', async () => {
    stored = 6;
    const res = await put({ retentionTerms: null });
    assert.equal(res.status, 200);
    const body = await json(res);
    assert.equal(body.retentionTerms, null);
    assert.equal(body.window, null);
    assert.equal(stored, null);
  });

  test('without migration 016: 503 retention_unavailable, and no write', async () => {
    columnPresent = false;
    const res = await put({ retentionTerms: 6 });
    assert.equal(res.status, 503);
    assert.equal((await json(res)).code, 'retention_unavailable');
    assert.deepEqual(writes(), []);
  });

  test('the demo account cannot turn it on, but can turn it off', async () => {
    isDemo = true;
    const on = await put({ retentionTerms: 3 });
    assert.equal(on.status, 403);
    assert.equal((await json(on)).code, 'retention_demo');
    assert.equal(stored, null);
    const off = await put({ retentionTerms: null });
    assert.equal(off.status, 200);
  });
});

describe('GET /transactions/retention-settings', () => {
  test('reports what is stored, not a constant', async () => {
    stored = 9;
    const res = await fetch(`${baseUrl}/transactions/retention-settings`);
    assert.equal(res.status, 200);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    const body = await json(res);
    assert.equal(body.retentionTerms, 9);
    assert.deepEqual(body.choices, [3, 6, 9, 12]);
    assert.equal(body.window?.keepFromTerm, lastNTerms(9)[0]);
    const read = queries.find((q) => q.text.startsWith('SELECT transaction_retention_terms'))!;
    assert.deepEqual(read.params, [7]);
  });

  test('off by default', async () => {
    const body = await json(await fetch(`${baseUrl}/transactions/retention-settings`));
    assert.equal(body.retentionTerms, null);
    assert.equal(body.window, null);
  });

  test('without migration 016: unavailable and off, after only the probe', async () => {
    columnPresent = false;
    const body = await json(await fetch(`${baseUrl}/transactions/retention-settings`));
    assert.equal(body.available, false);
    assert.equal(body.retentionTerms, null);
    assert.equal(queries.length, 1);
    assert.match(queries[0]!.text, /information_schema\.columns/);
  });
});

describe('GET /transactions/retention-preview', () => {
  for (const qs of ['', '?terms=', '?terms=4', '?terms=abc', '?terms=6.0', '?terms=6&terms=6', '?terms=-3']) {
    test(`rejects ${qs || 'no terms'} without a query`, async () => {
      const res = await fetch(`${baseUrl}/transactions/retention-preview${qs}`);
      assert.equal(res.status, 400);
      assert.equal(queries.length, 0);
    });
  }

  test('counts the caller\'s rows below the cutoff terms.ts gives, and deletes nothing', async () => {
    const res = await fetch(`${baseUrl}/transactions/retention-preview?terms=3`);
    assert.equal(res.status, 200);
    const body: unknown = await json(res);
    const keepFromTerm = lastNTerms(3)[0]!;
    assert.deepEqual(body, { terms: 3, keepFromTerm, cutoff: boundsOf(keepFromTerm).start, count: 41 });
    assert.equal(queries.length, 1);
    assert.match(queries[0]!.text, /^SELECT count\(\*\)::int AS count FROM transactions WHERE user_id = \$1 AND date < \$2$/);
    assert.deepEqual(queries[0]!.params, [7, boundsOf(keepFromTerm).start]);
  });
});

test('DELETE /transactions/auto-delete is gone: it is an invalid id, and nothing is deleted', async () => {
  const res = await fetch(`${baseUrl}/transactions/auto-delete?months=4`, { method: 'DELETE' });
  assert.equal(res.status, 400);
  assert.equal(queries.length, 0);
});
