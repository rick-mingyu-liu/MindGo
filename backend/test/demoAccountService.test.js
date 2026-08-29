const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const db = require('../db/connection');
const logger = require('../utils/logger');
const {
  refreshDemoAccount,
  refreshDemoAccountOnSchedule,
  OWNED_TABLES,
} = require('../services/demoAccountService');

/**
 * The demo refresh runs unattended on a timer and deletes every row belonging
 * to its target before rewriting them. Everything here is about what it
 * refuses to do.
 *
 * The hazard it was built around: resolving the demo account by
 * `email = 'john.doe@example.com'` makes the target a guessable string.
 * Nothing reserves that address, so a scheduled job pointed at it would wipe a
 * real person's data every month with nobody watching. Run by hand the
 * exposure is bounded — a human is present. On a timer it is not.
 */

let queries;
let client;
let demoRows;

beforeEach(() => {
  queries = [];
  demoRows = [{ id: 42 }];

  client = {
    query: async (text, params) => {
      queries.push({ text: text.replace(/\s+/g, ' ').trim(), params });
      if (/SELECT id FROM users WHERE is_demo/.test(text)) return { rows: demoRows, rowCount: demoRows.length };
      if (/^\s*INSERT INTO users/.test(text)) return { rows: [{ id: 99 }], rowCount: 1 };
      if (/^\s*DELETE FROM/.test(text)) return { rows: [], rowCount: 7 };
      return { rows: [], rowCount: 0 };
    },
    release: () => { client.released = true; },
    released: false,
  };

  mock.method(db, 'getPool', () => ({ connect: async () => client }));
});

afterEach(() => mock.restoreAll());

const sql = () => queries.map((q) => q.text);
const ran = (pattern) => sql().some((t) => pattern.test(t));

describe('what it identifies the demo account by', () => {
  test('resolves its target by the is_demo flag, never by an email address', () => {
    return refreshDemoAccount({ create: false }).then(() => {
      assert.ok(ran(/SELECT id FROM users WHERE is_demo = TRUE/),
        'did not look the account up by its flag');
      // The whole point. An email in the lookup would put a guessable string
      // between a timer and a DELETE.
      const lookups = sql().filter((t) => /^SELECT/.test(t));
      for (const q of lookups) {
        assert.doesNotMatch(q, /email/i, `resolved the target by email: ${q}`);
      }
    });
  });

  test('every delete is scoped to the resolved user id', async () => {
    await refreshDemoAccount({ create: false });
    const deletes = queries.filter((q) => /^DELETE FROM/.test(q.text));
    assert.equal(deletes.length, OWNED_TABLES.length);
    for (const d of deletes) {
      assert.match(d.text, /WHERE user_id = \$1/, `unscoped delete: ${d.text}`);
      assert.deepEqual(d.params, [42]);
    }
  });

  test('it is not a database reset — nothing is deleted unscoped', async () => {
    await refreshDemoAccount({ create: true });
    for (const t of sql()) {
      if (/^DELETE/.test(t)) assert.match(t, /WHERE user_id/, `bare DELETE: ${t}`);
      assert.doesNotMatch(t, /TRUNCATE|DROP /i, `destructive statement: ${t}`);
    }
  });
});

describe('when no account is flagged', () => {
  beforeEach(() => { demoRows = []; });

  test('the scheduled form deletes nothing and creates nothing', async () => {
    const result = await refreshDemoAccount({ create: false });
    assert.equal(result.status, 'absent');
    assert.equal(result.deleted, 0);
    assert.ok(!ran(/^DELETE/), 'deleted rows with no demo account resolved');
    assert.ok(!ran(/INSERT INTO users/), 'a scheduled run conjured its own target');
    assert.ok(ran(/^ROLLBACK$/), 'left the transaction open');
  });

  test('the seeder may create it, because a human asked', async () => {
    const result = await refreshDemoAccount({ create: true });
    assert.equal(result.status, 'created');
    assert.ok(ran(/INSERT INTO users/));
    assert.match(sql().find((t) => /INSERT INTO users/.test(t)), /is_demo/);
  });

  test('the scheduled form says so where production can see it', async () => {
    // logger.warn prints nothing in production, and a refresh that silently
    // does nothing forever is exactly what needs saying out loud.
    const lines = [];
    mock.method(logger, 'error', (msg) => lines.push(msg));
    const deleted = await refreshDemoAccountOnSchedule();
    assert.equal(deleted, 0);
    assert.equal(lines.length, 1);
    assert.match(lines[0], /is_demo/);
    assert.match(lines[0], /db:seed/, 'did not say how to fix it');
  });
});

describe('atomicity', () => {
  test('runs on one client, not through the pool', async () => {
    // db.query hands out a different pooled connection per call, so BEGIN and
    // COMMIT issued through it need not land on the same session.
    const poolQuery = mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));
    await refreshDemoAccount({ create: false });
    assert.equal(poolQuery.mock.callCount(), 0, 'used the pool instead of a client');
    assert.equal(sql()[0], 'BEGIN');
    assert.equal(sql().at(-1), 'COMMIT');
  });

  test('a failure part-way rolls back and releases the client', async () => {
    const boom = new Error('connection lost');
    client.query = async (text) => {
      queries.push({ text: text.replace(/\s+/g, ' ').trim() });
      if (/SELECT id FROM users/.test(text)) return { rows: [{ id: 42 }] };
      if (/INSERT INTO transactions/.test(text)) throw boom;
      return { rows: [], rowCount: 0 };
    };

    // Throws rather than logging and returning, like cleanupService: the
    // caller decides what a failed refresh means.
    await assert.rejects(refreshDemoAccount({ create: false }), /connection lost/);
    assert.ok(ran(/^ROLLBACK$/), 'left a half-rewritten account committed');
    assert.ok(client.released, 'leaked the client back to nobody');
  });

  test('the client is released on the happy path too', async () => {
    await refreshDemoAccount({ create: false });
    assert.ok(client.released);
  });
});

describe('what the scheduler logs', () => {
  test('returns the deleted count, which is the half worth auditing', async () => {
    // scheduleInterval audits a non-zero return and routes zero to the dev
    // channel — decision D: audit is for destroying user data.
    mock.method(logger, 'info', () => {});
    const deleted = await refreshDemoAccountOnSchedule();
    assert.equal(deleted, OWNED_TABLES.length * 7);
  });
});
