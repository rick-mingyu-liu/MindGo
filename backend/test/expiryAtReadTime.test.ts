import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import type { Request, Response } from 'express';
import db = require('../db/connection');
import authController = require('../controllers/authController');

/**
 * Expiry is enforced where rows are read, not by the sweep that deletes them.
 *
 * The retention deletions run once an hour (schedulerService), so an expired
 * verification token can sit in the database for up to an hour past its
 * lifetime, longer if the process was down. None of that may be visible: an
 * expired token must be refused, whether or not the sweep has got to it.
 *
 * No database: db.query is mocked, and the real handlers are called directly.
 * The Postgres-backed half of this, in api.test.ts, runs the same SQL for
 * real.
 */

interface Captured {
  status: number;
  body: unknown;
}

function fakeRes(): { res: Response; out: Captured } {
  const out: Captured = { status: 200, body: undefined };
  const res = {
    status(code: number) {
      out.status = code;
      return this;
    },
    json(body: unknown) {
      out.body = body;
      return this;
    },
  } as unknown as Response;
  return { res, out };
}

const asReq = (fields: Record<string, unknown>): Request =>
  ({ params: {}, query: {}, body: {}, user: { userId: 7 }, ...fields }) as unknown as Request;

describe('verification tokens expire on time, swept or not', () => {
  let calls: string[];

  beforeEach(() => {
    calls = [];
    mock.method(console, 'log', () => {});
  });
  afterEach(() => mock.restoreAll());

  function userWhoseTokenExpires(expires: Date): void {
    mock.method(db, 'query', async (sql: string) => {
      calls.push(sql);
      if (sql.startsWith('SELECT')) {
        return {
          rows: [{ id: 3, email: 'a@example.com', first_name: 'A', email_verification_expires: expires, created_at: new Date(0) }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 1 };
    });
  }

  test('a token a second past its expiry is refused, and nothing is written', async () => {
    // The account row is still there (the sweep has not run), which is exactly
    // the case that must not verify.
    userWhoseTokenExpires(new Date(Date.now() - 1000));
    const { res, out } = fakeRes();
    await authController.verifyEmail(asReq({ params: { token: 'abc' } }), res);
    assert.equal(out.status, 400);
    assert.deepEqual(out.body, { error: 'Verification token has expired' });
    assert.equal(calls.filter((sql) => sql.startsWith('UPDATE')).length, 0);
  });

  test('a token inside its window verifies', async () => {
    userWhoseTokenExpires(new Date(Date.now() + 60_000));
    const { res, out } = fakeRes();
    await authController.verifyEmail(asReq({ params: { token: 'abc' } }), res);
    assert.equal(out.status, 200);
    assert.equal(calls.filter((sql) => sql.startsWith('UPDATE users SET email_verified = TRUE')).length, 1);
  });
});
