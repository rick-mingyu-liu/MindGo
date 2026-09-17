const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const express = require('express');
const db = require('../db/connection');
const config = require('../config');
const aiPlanner = require('../services/aiPlanner');

/**
 * When OpenAI will not answer — the account is out of credit (measured
 * 2026-09-17: 429 credit_balance_exhausted) or rate-limited — every AI
 * endpoint said "Failed to generate AI plan" with a 500, which the frontend
 * shows as a generic server error. It is now a 503 with a code the page can
 * recognise, while any other failure stays a 500.
 *
 * Runs the real router with auth stubbed, the database stubbed and a fake
 * OpenAI client, so nothing leaves the process and nothing is billed.
 */

const authPath = require.resolve('../middleware/auth');
const routerPath = require.resolve('../routes/ai');

let server;
let baseUrl;
let failWith;
const originalKey = config.apiKeys.openai;
const originalClient = aiPlanner.openai;

before(async () => {
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => { req.user = { userId: 7 }; next(); },
  };
  delete require.cache[routerPath];

  const app = express();
  app.use(express.json());
  app.use('/ai', require(routerPath));
  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete require.cache[authPath];
  delete require.cache[routerPath];
  config.apiKeys.openai = originalKey;
  aiPlanner.openai = originalClient;
});

beforeEach(() => {
  config.apiKeys.openai = 'test-key';
  aiPlanner.openai = {
    chat: { completions: { create: async () => { throw failWith; } } },
  };
  mock.method(db, 'query', async () => ({ rowCount: 0, rows: [] }));
  mock.method(console, 'error', () => {});
});

afterEach(() => mock.restoreAll());

const openAiError = (status, code) => Object.assign(new Error(`${status} ${code}`), { status, code });
const post = (path, body) => fetch(`${baseUrl}/ai${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('AI endpoints when OpenAI will not answer', () => {
  for (const [label, error] of [
    ['out of credit', openAiError(429, 'credit_balance_exhausted')],
    ['out of quota', openAiError(429, 'insufficient_quota')],
    ['rate-limited', openAiError(429, 'rate_limit_exceeded')],
  ]) {
    for (const [path, body] of [
      ['/plan', { financialGoal: 'Save $1,000', includeFinancialData: false }],
      ['/budget-recommendations', {}],
      ['/investment-advice', {}],
    ]) {
      test(`${label}: ${path} answers 503 ai_unavailable`, async () => {
        failWith = error;
        const res = await post(path, body);
        assert.equal(res.status, 503);
        const json = await res.json();
        assert.equal(json.code, 'ai_unavailable');
        assert.match(json.error, /temporarily unavailable/);
      });
    }
  }

  test('any other OpenAI failure is still a 500', async () => {
    failWith = openAiError(500, 'server_error');
    const res = await post('/plan', { financialGoal: 'Save $1,000', includeFinancialData: false });
    assert.equal(res.status, 500);
    assert.notEqual((await res.json()).code, 'ai_unavailable');
  });
});
