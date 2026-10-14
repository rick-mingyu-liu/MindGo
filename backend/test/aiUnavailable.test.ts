import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Server } from 'node:http';
import express from 'express';
import db = require('../db/connection');
import config = require('../config');
import aiPlanner = require('../services/aiPlanner');

/**
 * When the AI provider will not answer, every AI endpoint used to say
 * "Failed to generate AI plan" with a 500, which the frontend shows as a
 * generic server error. It is now a 503 with a code the page can recognise,
 * while any other failure stays a 500. The provider is DeepSeek; the statuses
 * below are the ones its error-code page gives for a wrong or revoked key
 * (401), an empty balance (402), throttling (429) and overload (503).
 *
 * Runs the real router with auth stubbed, the database stubbed and a fake
 * client, so nothing leaves the process and nothing is billed.
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
const originalKey = config.apiKeys.deepseek;
const originalClient = aiPlanner.deepseek;

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
  config.apiKeys.deepseek = originalKey;
  aiPlanner.deepseek = originalClient;
});

beforeEach(() => {
  config.apiKeys.deepseek = 'test-key';
  aiPlanner.deepseek = {
    chat: { completions: { create: async () => { throw failWith; } } },
  };
  mock.method(db, 'query', async () => ({ rowCount: 0, rows: [] }));
  mock.method(console, 'error', () => {});
});

afterEach(() => mock.restoreAll());

// The shape the openai SDK throws for a non-2xx answer: an Error carrying
// .status. DeepSeek's bodies are not OpenAI's, so .code is whatever they say
// and is deliberately not what the mapping reads.
const apiError = (status: number, message: string): Error =>
  Object.assign(new Error(`${status} ${message}`), { status });
const post = (path: string, body: unknown) => fetch(`${baseUrl}/ai${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

describe('AI endpoints when DeepSeek will not answer', () => {
  const errors: [string, Error][] = [
    ['wrong or revoked key', apiError(401, 'Authentication Fails')],
    ['out of balance', apiError(402, 'Insufficient Balance')],
    ['rate-limited', apiError(429, 'Rate Limit Reached')],
    ['overloaded', apiError(503, 'Server Overloaded')],
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

  for (const [label, error] of [
    ['server error', apiError(500, 'Server Error')],
    ['invalid parameters', apiError(422, 'Invalid Parameters')],
  ] as const) {
    test(`any other failure (${label}) is still a 500`, async () => {
      failWith = error;
      const res = await post('/plan', { financialGoal: 'Save $1,000', includeFinancialData: false });
      assert.equal(res.status, 500);
      assert.notEqual((await res.json() as AiErrorResponse).code, 'ai_unavailable');
    });
  }

  test('no key configured is a 500 naming the missing setting, and never calls out', async () => {
    config.apiKeys.deepseek = undefined;
    let called = false;
    aiPlanner.deepseek = { chat: { completions: { create: async () => { called = true; throw failWith; } } } };
    const res = await post('/plan', { financialGoal: 'Save $1,000', includeFinancialData: false });
    assert.equal(res.status, 500);
    assert.match((await res.json() as AiErrorResponse).error, /DeepSeek API key/);
    assert.equal(called, false);
  });

  test('asks DeepSeek for the configured model with thinking off', async () => {
    let sent: { model?: unknown; thinking?: unknown } = {};
    aiPlanner.deepseek = {
      chat: { completions: { create: async (params: unknown) => {
        sent = params as typeof sent;
        return { choices: [{ message: { content: '# Summary' } }] };
      } } },
    };
    const res = await post('/budget-recommendations', {});
    assert.equal(res.status, 200);
    assert.equal(sent.model, config.ai.model);
    assert.deepEqual(sent.thinking, { type: 'disabled' });
  });
});
