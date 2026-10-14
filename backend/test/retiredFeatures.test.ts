import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import axios from 'axios';
import db = require('../db/connection');
import config = require('../config');
import investmentRoutes = require('../routes/investments');
import aiRoutes = require('../routes/ai');
import goalRoutes = require('../routes/goals');

const app = express();
app.use(express.json());
app.use('/investments', investmentRoutes);
app.use('/ai', aiRoutes);
app.use('/goals', goalRoutes);
const secret = 'retired-feature-tests-only-signing-secret';
const token = jwt.sign({ userId: 7, email: 'archive@example.test' }, secret);
const originalSecret = config.jwt.secret;
let queries: Array<{ sql: string; params: unknown[] }>;
let providerCalls: number;

beforeEach(() => {
  config.jwt.secret = secret;
  queries = [];
  providerCalls = 0;
  mock.method(db, 'query', async (sql: string, params: unknown[] = []) => {
    queries.push({ sql, params });
    return { rows: [], rowCount: 0 };
  });
  const forbidProvider = async () => {
    providerCalls++;
    throw new Error('Retired endpoints must never contact a provider');
  };
  mock.method(axios, 'get', forbidProvider);
  mock.method(axios, 'post', forbidProvider);
  mock.method(globalThis, 'fetch', forbidProvider);
  mock.method(console, 'error', () => {});
});
afterEach(() => {
  config.jwt.secret = originalSecret;
  mock.restoreAll();
});

const retired: Array<['get' | 'post' | 'delete', string, string]> = [
  ['get', '/investments/snapshot/AAPL', 'investments_retired'],
  ['get', '/investments/watchlist', 'investments_retired'],
  ['post', '/investments/watchlist', 'investments_retired'],
  ['delete', '/investments/watchlist/42', 'investments_retired'],
  ['get', '/investments/historical/AAPL', 'investments_retired'],
  ['get', '/investments/market-overview', 'investments_retired'],
  ['get', '/investments/news/AAPL', 'investments_retired'],
  ['get', '/investments/financials/AAPL', 'investments_retired'],
  ['get', '/investments/watchlist/ai-summary', 'investments_retired'],
  ['get', '/investments/search?q=AAPL', 'investments_retired'],
  ['get', '/investments/analysis/AAPL', 'investments_retired'],
  ['post', '/ai/plan', 'ai_planning_retired'],
  ['post', '/ai/budget-recommendations', 'ai_planning_retired'],
  ['post', '/ai/investment-advice', 'ai_planning_retired'],
  ['post', '/goals/from-ai-plan', 'ai_planning_retired'],
];

describe('retired stock and one-shot planning operations', () => {
  for (const [method, path, code] of retired) {
    test(`${method.toUpperCase()} ${path} returns 410 without database or provider access`, async () => {
      for (const body of [{}, { prompt: '', financialGoal: '', riskTolerance: 'invalid', investmentAmount: -1, symbol: '', aiPlanId: 42 }, { prompt: 'Save', financialGoal: 'Save', symbol: 'AAPL', aiPlanId: 42, name: 'Laptop', target_amount: 1500, target_date: '2027-01-01' }]) {
        const response = await request(app)[method](path).set('Authorization', `Bearer ${token}`).send(body);
        assert.equal(response.status, 410);
        assert.equal(response.body.code, code);
        assert.equal(typeof response.body.error, 'string');
        assert.deepEqual(queries, []);
        assert.equal(providerCalls, 0);
      }
    });
    test(`${method.toUpperCase()} ${path} still requires valid authentication`, async () => {
      for (const authorization of ['', 'Bearer invalid']) {
        const response = await request(app)[method](path).set('Authorization', authorization).send({});
        assert.equal(response.status, 401);
      }
      assert.deepEqual(queries, []);
      assert.equal(providerCalls, 0);
    });
  }
});

describe('legacy archive access', () => {
  test('clear-all deletes only the authenticated user’s archived watchlist', async () => {
    const response = await request(app).delete('/investments/watchlist/clear-all').set('Authorization', `Bearer ${token}`);
    assert.equal(response.status, 200);
    assert.equal(queries.length, 1);
    assert.match(queries[0]!.sql, /^DELETE FROM watchlist WHERE user_id = \$1$/);
    assert.deepEqual(queries[0]!.params, [7]);
    assert.equal(providerCalls, 0);
  });

  for (const [method, path] of [['delete', '/investments/watchlist/clear-all'], ['get', '/ai/plans'], ['get', '/ai/plans/42']] as const) {
    test(`${method.toUpperCase()} ${path} still requires valid authentication`, async () => {
      for (const authorization of ['', 'Bearer invalid']) {
        const response = await request(app)[method](path).set('Authorization', authorization);
        assert.equal(response.status, 401);
      }
      assert.deepEqual(queries, []);
    });
  }

  for (const [method, path] of [['delete', '/investments/watchlist/clear-all'], ['get', '/ai/plans'], ['get', '/ai/plans/42']] as const) {
    test(`${method.toUpperCase()} ${path} does not log archived data on database failure`, async () => {
      const logs: unknown[][] = [];
      mock.method(console, 'error', (...args: unknown[]) => logs.push(args));
      mock.method(db, 'query', async () => {
        throw Object.assign(new Error('private archived row content'), { code: 'XX000' });
      });
      const response = await request(app)[method](path).set('Authorization', `Bearer ${token}`);
      assert.equal(response.status, 500);
      assert.equal(logs.length, 1);
      assert.deepEqual(logs[0]![1], { userId: 7, error: 'Error', code: 'XX000' });
      assert.doesNotMatch(JSON.stringify(logs), /private archived row content/);
    });
  }

  test('history and individual reads retain owner and 30-minute expiry filters', async () => {
    mock.method(db, 'query', async (sql: string, params: unknown[]) => {
      queries.push({ sql, params });
      return /COUNT/.test(sql) ? { rows: [{ count: '0' }], rowCount: 1 } : { rows: [], rowCount: 0 };
    });
    const history = await request(app).get('/ai/plans').set('Authorization', `Bearer ${token}`);
    assert.equal(history.status, 200);
    assert.deepEqual(history.body.plans, []);
    assert.equal(history.body.pagination.total, 0);
    const plan = await request(app).get('/ai/plans/42').set('Authorization', `Bearer ${token}`);
    assert.equal(plan.status, 404);
    assert.equal(queries.length, 3);
    for (const { sql, params } of queries) {
      assert.match(sql, /^SELECT /);
      const owner = sql.match(/user_id = \$(\d+)/);
      const lifetime = sql.match(/created_at >= NOW\(\) - make_interval\(mins => \$(\d+)\)/);
      assert.ok(owner);
      assert.ok(lifetime);
      assert.equal(params[Number(owner[1]) - 1], 7);
      assert.equal(params[Number(lifetime[1]) - 1], 30);
    }
    assert.equal(providerCalls, 0);
  });
});
