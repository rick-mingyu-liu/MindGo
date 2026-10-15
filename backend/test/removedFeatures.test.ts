import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';

/**
 * The stock watchlist and one-shot AI plans are gone, not retired: their
 * routers are no longer mounted, so every path under /investments and /ai —
 * and the old POST /goals/from-ai-plan — falls through to the app's ordinary
 * 404. This runs the real app.ts, so a router quietly re-mounted there fails
 * here.
 *
 * No database: db.query is replaced with one that fails the test if anything
 * reaches it. The environment is set before app.ts is required, and a dummy
 * DATABASE_URL keeps dotenv from loading the real one in .env (dotenv never
 * overrides a variable that is already set).
 */
process.env.DATABASE_URL = 'postgres://removed-features-test.invalid/none';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';

describe('removed stock and AI plan endpoints', () => {
  let request: typeof import('supertest');
  let app: typeof import('../app');
  let token: string;
  let queries: number;

  before(() => {
    request = require('supertest');
    app = require('../app');
    const db: typeof import('../db/connection') = require('../db/connection');
    const jwt: typeof import('jsonwebtoken') = require('jsonwebtoken');
    queries = 0;
    mock.method(db, 'query', async () => {
      queries++;
      throw new Error('removed endpoints must not reach the database');
    });
    token = jwt.sign({ userId: 7, email: 'removed@example.test' }, process.env.JWT_SECRET!);
  });
  after(() => mock.restoreAll());

  const removed: Array<['get' | 'post' | 'delete', string]> = [
    ['get', '/investments/watchlist'],
    ['post', '/investments/watchlist'],
    ['delete', '/investments/watchlist/clear-all'],
    ['get', '/investments/snapshot/AAPL'],
    ['get', '/investments/search?q=AAPL'],
    ['get', '/ai/plans'],
    ['get', '/ai/plans/42'],
    ['post', '/ai/plan'],
    ['post', '/ai/budget-recommendations'],
    ['post', '/ai/investment-advice'],
  ];

  for (const [method, path] of removed) {
    test(`${method.toUpperCase()} ${path} is an ordinary 404, signed in or not`, async () => {
      for (const authorization of ['', `Bearer ${token}`]) {
        const res = await request(app)[method](path).set('Authorization', authorization).send({});
        assert.equal(res.status, 404);
        assert.deepEqual(res.body, { error: 'Route not found' });
      }
      assert.equal(queries, 0);
    });
  }

  test('POST /goals/from-ai-plan is no longer a goals route', async () => {
    const res = await request(app).post('/goals/from-ai-plan').set('Authorization', `Bearer ${token}`)
      .send({ aiPlanId: 1, name: 'x', target_amount: 1, target_date: '2030-01-01' });
    assert.equal(res.status, 404);
    assert.equal(queries, 0);
  });
});
