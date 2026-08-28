const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/connection');
const config = require('../config');
const cleanupService = require('../services/cleanupService');

/**
 * Unit tests for the scheduled deletions. No database: db.query is mocked.
 *
 * These two statements delete user accounts and AI plans on a timer, with
 * nobody watching. The properties worth pinning down are therefore less about
 * the happy path than about the shape of the SQL and what happens when it
 * fails.
 */

function queryReturning(rowCount) {
  return mock.method(db, 'query', async () => ({ rowCount, rows: [] }));
}

describe('deleteOldAIPlans', () => {
  beforeEach(() => mock.restoreAll());

  test('returns the number of rows deleted', async () => {
    queryReturning(7);
    assert.equal(await cleanupService.deleteOldAIPlans(), 7);
  });

  test('deletes from ai_plans, bounded by the configured retention', async () => {
    const query = queryReturning(0);

    await cleanupService.deleteOldAIPlans();

    const [sql, params] = query.mock.calls[0].arguments;
    assert.match(sql, /^DELETE FROM ai_plans\b/);
    assert.match(sql, /created_at < NOW\(\) - make_interval\(mins => \$1\)/);
    assert.deepEqual(params, [config.dataRetention.aiPlanMinutes]);
  });

  test('propagates a database error instead of swallowing it', async () => {
    // The whole point of moving this out of the controller. The old version
    // caught its own error and returned normally, so the scheduler logged
    // "cleanup completed" for a cleanup that had not happened.
    mock.method(db, 'query', async () => {
      throw new Error('connection terminated');
    });

    await assert.rejects(() => cleanupService.deleteOldAIPlans(), /connection terminated/);
  });
});

describe('deleteUnverifiedAccounts', () => {
  beforeEach(() => mock.restoreAll());

  test('returns the number of rows deleted', async () => {
    queryReturning(3);
    assert.equal(await cleanupService.deleteUnverifiedAccounts(), 3);
  });

  test('only ever deletes accounts that are both unverified and expired', async () => {
    // Losing either predicate deletes real users' accounts on a 10-minute
    // timer. Worth asserting rather than assuming.
    const query = queryReturning(0);

    await cleanupService.deleteUnverifiedAccounts();

    const [sql, params] = query.mock.calls[0].arguments;
    assert.match(sql, /^DELETE FROM users\b/);
    assert.match(sql, /email_verified = FALSE/);
    assert.match(sql, /created_at < NOW\(\) - make_interval\(mins => \$1\)/);
    assert.deepEqual(params, [config.dataRetention.unverifiedAccountMinutes]);
  });

  test('does not RETURNING the deleted rows', async () => {
    // It used to, and then logged every deleted account's email address —
    // putting user emails into the server log every ten minutes. The row count
    // is all the caller needs.
    const query = queryReturning(0);

    await cleanupService.deleteUnverifiedAccounts();

    assert.doesNotMatch(query.mock.calls[0].arguments[0], /RETURNING/i);
  });

  test('propagates a database error instead of swallowing it', async () => {
    mock.method(db, 'query', async () => {
      throw new Error('connection terminated');
    });

    await assert.rejects(() => cleanupService.deleteUnverifiedAccounts(), /connection terminated/);
  });
});
