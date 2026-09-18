import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import db = require('../db/connection');
import config = require('../config');
import aiPlanner = require('../services/aiPlanner');

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

interface AiErrorResponse {
  error: string;
  code?: string;
}

let server: Server;
let baseUrl: string;
let failWith: Error;
const originalKey = config.apiKeys.openai;
const originalClient = aiPlanner.openai;

before(async () => {
  // A stub Module: only `exports` (the auth middleware itself) is ever read
  // back out of the cache here, so the rest of NodeJS.Module's shape is unused.
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req: { user?: unknown }, _res: unknown, next: () => void) => { req.user = { userId: 7 }; next(); },
  } as NodeJS.Module;
  delete require.cache[routerPath];

  const app = express();
  app.use(express.json());
  app.use('/ai', require(routerPath));
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

const openAiError = (status: number, code: string): Error =>
  Object.assign(new Error(`${status} ${code}`), { status, code });
const post = (path: string, body: unknown) => fetch(`${baseUrl}/ai${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('AI endpoints when OpenAI will not answer', () => {
  const errors: [string, Error][] = [
    ['out of credit', openAiError(429, 'credit_balance_exhausted')],
    ['out of quota', openAiError(429, 'insufficient_quota')],
    ['rate-limited', openAiError(429, 'rate_limit_exceeded')],
  ];
  const endpoints: [string, Record<string, unknown>][] = [
    ['/plan', { financialGoal: 'Save $1,000', includeFinancialData: false }],
    ['/budget-recommendations', {}],
    ['/investment-advice', {}],
  ];
  for (const [label, error] of errors) {
    for (const [path, body] of endpoints) {
      test(`${label}: ${path} answers 503 ai_unavailable`, async () => {
        failWith = error;
        const res = await post(path, body);
        assert.equal(res.status, 503);
        const json = await res.json() as AiErrorResponse;
        assert.equal(json.code, 'ai_unavailable');
        assert.match(json.error, /temporarily unavailable/);
      });
    }
  }

  test('any other OpenAI failure is still a 500', async () => {
    failWith = openAiError(500, 'server_error');
    const res = await post('/plan', { financialGoal: 'Save $1,000', includeFinancialData: false });
    assert.equal(res.status, 500);
    assert.notEqual((await res.json() as AiErrorResponse).code, 'ai_unavailable');
  });
});
