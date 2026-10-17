import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import util from 'node:util';
import type { Server } from 'node:http';
import express from 'express';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import db = require('../db/connection');
import config = require('../config');
import { OWNED_TABLES, onAccountDeleted } from '../services/accountService';

/**
 * DELETE /auth/account through the real auth router and the real JWT
 * middleware, with the database stubbed: validation stops a bad body before
 * any connection is taken; a wrong password and the demo account delete
 * nothing; a success deletes every per-user table, children first, then the
 * user row, in one transaction on one client; and nothing logged or answered
 * contains the password, the address or a database error's message.
 *
 * Each test signs in as its own user id: the per-user limiter is built once,
 * at module load, and would otherwise count every test's requests together.
 */

const routerPath = require.resolve('../routes/auth');
const limiterPath = require.resolve('../middleware/rateLimiter');
const SECRET = 'account-deletion-test-secret';
const PASSWORD = 'fictional-correct-password';
const WRONG = 'fictional-wrong-password';
const EMAIL = 'deletion.subject@example.invalid';

interface Query { text: string; params: unknown[] }

let server: Server;
let baseUrl: string;
let savedSecret: string | undefined;
let hash: string;
let queries: Query[];
let connects: number;
let released: number;
let isDemo: boolean;
let userFound: boolean;
let presentTables: readonly string[];
/** A DELETE of this table throws, with row values in the message as pg's can have. */
let failOn: string | null;
let printed: unknown[][];
let nextUser = 100;

before(async () => {
  savedSecret = config.jwt.secret;
  config.jwt.secret = SECRET;
  hash = await bcrypt.hash(PASSWORD, 4);
  delete require.cache[limiterPath];
  delete require.cache[routerPath];
  const app = express();
  app.use(express.json());
  app.use('/auth', require(routerPath));
  server = app.listen(0);
  await new Promise<void>((resolve) => server.once('listening', () => resolve()));
  const address = server.address();
  if (address === null || typeof address === 'string') throw new Error('expected a bound TCP address');
  baseUrl = `http://127.0.0.1:${address.port}`;
});

after(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
  config.jwt.secret = savedSecret;
  delete require.cache[limiterPath];
  delete require.cache[routerPath];
});

beforeEach(() => {
  queries = [];
  connects = 0;
  released = 0;
  isDemo = false;
  userFound = true;
  presentTables = OWNED_TABLES;
  failOn = null;
  printed = [];
  const client = {
    query: async (text: string, params: unknown[] = []) => {
      queries.push({ text, params });
      if (text.startsWith('SELECT password_hash')) {
        return { rowCount: userFound ? 1 : 0, rows: userFound ? [{ password_hash: hash, is_demo: isDemo }] : [] };
      }
      if (text.includes('to_regclass')) return { rowCount: presentTables.length, rows: presentTables.map((name) => ({ name })) };
      const deleting = /^DELETE FROM (\w+)/.exec(text)?.[1];
      if (deleting === failOn) {
        throw Object.assign(new Error(`violates constraint: Key (email)=(${EMAIL}) amount 12.50`), { code: '23503' });
      }
      if (deleting) return { rowCount: deleting === 'users' ? 1 : 2, rows: [] };
      return { rowCount: 0, rows: [] };
    },
    release: () => { released += 1; },
  };
  mock.method(db, 'getPool', () => ({ connect: async () => { connects += 1; return client; } }));
  mock.method(db, 'query', async () => { throw new Error('the pool is never used directly'); });
  mock.method(console, 'log', (...args: unknown[]) => printed.push(args));
  mock.method(console, 'error', (...args: unknown[]) => printed.push(args));
  mock.method(console, 'warn', (...args: unknown[]) => printed.push(args));
});

afterEach(() => mock.restoreAll());

const render = (arg: unknown): string => (typeof arg === 'string' ? arg : util.inspect(arg, { depth: 6 }));
const output = () => printed.map((a) => a.map(render).join(' ')).join('\n');
const statements = () => queries.map((q) => q.text);
const deletes = () => queries.filter((q) => q.text.startsWith('DELETE'));

function signIn(userId = nextUser++): { userId: number; token: string } {
  return { userId, token: jwt.sign({ userId, email: EMAIL }, SECRET) };
}

async function remove(body: unknown, who = signIn()): Promise<{ status: number; body: Record<string, unknown>; text: string; cache: string | null }> {
  const res = await fetch(`${baseUrl}/auth/account`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${who.token}` },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, body: JSON.parse(text) as Record<string, unknown>, text, cache: res.headers.get('cache-control') };
}

function assertNothingSensitive(...also: string[]): void {
  const log = output();
  for (const secret of [PASSWORD, WRONG, EMAIL, 'd***@example.invalid', ...also]) {
    assert.ok(!log.includes(secret), `the log contains ${secret}:\n${log}`);
  }
}

describe('DELETE /auth/account', () => {
  test('needs a login', async () => {
    const res = await fetch(`${baseUrl}/auth/account`, { method: 'DELETE', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: PASSWORD }) });
    assert.equal(res.status, 401);
    assert.equal(connects, 0);
  });

  describe('rejects a bad body before taking a connection', () => {
    const cases: [string, unknown][] = [
      ['missing', {}],
      ['empty', { password: '' }],
      ['a number', { password: 12345678 }],
      ['an array', { password: [PASSWORD] }],
      ['an object', { password: { value: PASSWORD } }],
      ['too long', { password: 'x'.repeat(1025) }],
    ];
    for (const [label, body] of cases) {
      test(label, async () => {
        const res = await remove(body);
        assert.equal(res.status, 400, `${label} was not rejected`);
        assert.equal(connects, 0, `${label} reached the database`);
      });
    }
    test('the 400 does not echo the submitted value', async () => {
      const res = await remove({ password: [WRONG] });
      assert.equal(res.status, 400);
      assert.ok(!res.text.includes(WRONG), res.text);
    });
  });

  test('a wrong password is 403 account_password_incorrect, deletes nothing and logs the user id only', async () => {
    const who = signIn();
    const res = await remove({ password: WRONG }, who);
    assert.equal(res.status, 403, 'not 401: the client logs out on any 401');
    assert.equal(res.body.code, 'account_password_incorrect');
    assert.equal(res.cache, 'no-store');
    assert.deepEqual(deletes(), []);
    assert.ok(statements().includes('ROLLBACK'));
    assert.ok(!statements().includes('COMMIT'));
    assert.equal(released, 1);
    assert.match(output(), new RegExp(`wrong password: user ${who.userId}\\b`));
    assertNothingSensitive();
  });

  test('the demo account is 403 account_demo and deletes nothing, even with its right password', async () => {
    isDemo = true;
    const who = signIn();
    const res = await remove({ password: PASSWORD }, who);
    assert.equal(res.status, 403);
    assert.equal(res.body.code, 'account_demo');
    assert.deepEqual(deletes(), []);
    assert.ok(statements().includes('ROLLBACK'));
    assert.equal(released, 1);
    assertNothingSensitive();
  });

  test('an account already gone is 404 and deletes nothing', async () => {
    userFound = false;
    const res = await remove({ password: PASSWORD });
    assert.equal(res.status, 404);
    assert.equal(res.body.code, 'account_not_found');
    assert.deepEqual(deletes(), []);
  });

  test('the right password deletes every per-user table, children first, then the user, in one transaction', async () => {
    const who = signIn();
    const aborted: number[] = [];
    onAccountDeleted((userId) => aborted.push(userId));
    const res = await remove({ password: PASSWORD }, who);
    assert.equal(res.status, 200);
    assert.deepEqual(res.body, { deleted: true });
    assert.equal(res.cache, 'no-store');
    assert.equal(connects, 1);
    assert.equal(released, 1);

    const texts = statements();
    assert.equal(texts[0], 'BEGIN');
    assert.match(texts[1]!, /^SELECT password_hash, is_demo FROM users WHERE id = \$1 FOR UPDATE$/);
    assert.equal(texts.at(-1), 'COMMIT');
    assert.deepEqual(
      deletes().map((q) => q.text),
      [...OWNED_TABLES.map((t) => `DELETE FROM ${t} WHERE user_id = $1`), 'DELETE FROM users WHERE id = $1']
    );
    for (const q of [...deletes(), queries[1]!]) assert.deepEqual(q.params, [who.userId], `${q.text} was not bound to the JWT's user`);
    // Messages and proposals reference runs, receipts reference conversations.
    const order = deletes().map((q) => /^DELETE FROM (\w+)/.exec(q.text)![1]);
    assert.ok(order.indexOf('agent_messages') < order.indexOf('agent_runs'));
    assert.ok(order.indexOf('agent_goal_proposals') < order.indexOf('agent_runs'));
    assert.ok(order.indexOf('agent_receipts') < order.indexOf('agent_conversations'));
    assert.ok(order.indexOf('agent_runs') < order.indexOf('agent_conversations'));

    // The audit line: the user id and counts, nothing else.
    const log = output();
    assert.match(log, /\[AUDIT\].*Account deleted/);
    assert.match(log, new RegExp(`"userId": ${who.userId}`));
    assert.match(log, /"transactions": 2/);
    assert.match(log, /"users": 1/);
    assertNothingSensitive();
    assert.deepEqual(aborted, [who.userId], 'the running Pocky turns were not aborted');
  });

  test('a database without the agent tables deletes only what exists', async () => {
    presentTables = ['access_tokens', 'import_batches', 'savings_goals', 'transactions'];
    const res = await remove({ password: PASSWORD });
    assert.equal(res.status, 200);
    assert.deepEqual(
      deletes().map((q) => /^DELETE FROM (\w+)/.exec(q.text)![1]),
      ['access_tokens', 'import_batches', 'savings_goals', 'transactions', 'users']
    );
  });

  test('a database error rolls back, answers 500 and logs a code, not the message', async () => {
    failOn = 'savings_goals';
    const who = signIn();
    const res = await remove({ password: PASSWORD }, who);
    assert.equal(res.status, 500);
    assert.ok(statements().includes('ROLLBACK'));
    assert.ok(!statements().includes('COMMIT'));
    assert.ok(!statements().includes('DELETE FROM users WHERE id = $1'));
    assert.equal(released, 1);
    assert.ok(!res.text.includes('violates'), res.text);
    assert.match(output(), /23503/);
    assert.match(output(), new RegExp(`userId: ${who.userId}`));
    assertNothingSensitive('violates constraint', '12.50');
  });

  test('attempts are limited per user, and another user is unaffected', async () => {
    const who = signIn();
    for (let n = 0; n < config.rateLimit.accountDeleteMax; n++) {
      assert.equal((await remove({ password: WRONG }, who)).status, 403);
    }
    const limited = await remove({ password: PASSWORD }, who);
    assert.equal(limited.status, 429);
    assert.equal(limited.body.code, 'account_rate_limited');
    assert.equal((await remove({ password: WRONG })).status, 403, 'a different user shares the budget');
  });
});
