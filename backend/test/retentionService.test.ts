import { test, describe, beforeEach, afterEach, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import db = require('../db/connection');
import config = require('../config');
import logger = require('../utils/logger');
import scheduler = require('../services/schedulerService');
import * as retentionService from '../services/retentionService';
import { boundsOf, currentTerm, lastNTerms, termOf } from '../utils/terms';

/**
 * The automatic-deletion sweep with `db.query` mocked: where the line is drawn
 * (through utils/terms.ts, the same module and clock the dashboard's term view
 * uses, swept across four timezones), that nothing is deleted for a user who
 * did not opt in or before migration 016, that a failure throws and does not
 * stop the other maintenance steps, and that the audit log carries a user id
 * and a count and nothing from any row. test/retentionDb.test.ts runs the real
 * statement against PostgreSQL.
 */

const ZONES = ['UTC', 'America/Toronto', 'Asia/Shanghai', 'Pacific/Auckland'];
const savedTZ = process.env.TZ;
after(() => { process.env.TZ = savedTZ; });

describe('retentionWindow', () => {
  for (const tz of ZONES) {
    describe(`under TZ=${tz}`, () => {
      beforeEach(() => { process.env.TZ = tz; });

      test('mid-term: N terms back, the current one included, cut at a term start', () => {
        // Mid-October at noon UTC is mid-Fall in every zone.
        const now = new Date(Date.UTC(2026, 9, 16, 12));
        assert.deepEqual(retentionService.retentionWindow(3, now), { terms: 3, keepFromTerm: '2026-winter', cutoff: '2026-01-01' });
        assert.deepEqual(retentionService.retentionWindow(6, now), { terms: 6, keepFromTerm: '2025-winter', cutoff: '2025-01-01' });
        assert.deepEqual(retentionService.retentionWindow(9, now), { terms: 9, keepFromTerm: '2024-winter', cutoff: '2024-01-01' });
        assert.deepEqual(retentionService.retentionWindow(12, now), { terms: 12, keepFromTerm: '2023-winter', cutoff: '2023-01-01' });
      });

      test('on either side of a term boundary in local time, as the dashboard reads it', () => {
        const firstSecondOfSpring = new Date(2026, 4, 1, 0, 0, 1);
        const lastSecondOfWinter = new Date(2026, 3, 30, 23, 59, 59);
        assert.equal(retentionService.retentionWindow(3, firstSecondOfSpring).cutoff, '2025-09-01');
        assert.equal(retentionService.retentionWindow(3, lastSecondOfWinter).cutoff, '2025-05-01');
      });

      test('agrees with the term view: the current term is kept whole, and the cutoff is a term start', () => {
        for (const now of [new Date(2026, 0, 1, 0, 0, 1), new Date(2026, 7, 31, 23, 59), new Date(2026, 11, 31, 23, 59)]) {
          for (const n of config.dataRetention.transactionRetentionTermChoices) {
            const { keepFromTerm, cutoff } = retentionService.retentionWindow(n, now);
            assert.equal(lastNTerms(n, now).at(-1), currentTerm(now));
            assert.equal(cutoff, boundsOf(keepFromTerm).start);
            assert.equal(termOf(cutoff), keepFromTerm);
            assert.ok(cutoff <= boundsOf(currentTerm(now)).start);
          }
        }
      });
    });
  }
});

describe('the sweep', () => {
  let sql: { text: string; params: unknown[] }[];
  let present: boolean;
  let optedIn: { id: number; terms: number }[];
  let deleted: { user_id: number; deleted: number }[];
  let fail: RegExp | null;
  let audits: string[];
  let printed: string[];
  const now = new Date(Date.UTC(2026, 9, 16, 12));

  beforeEach(() => {
    process.env.TZ = 'UTC';
    retentionService.resetRetentionProbe();
    sql = [];
    present = true;
    optedIn = [];
    deleted = [];
    fail = null;
    audits = [];
    printed = [];
    mock.method(db, 'query', async (text: string, params: unknown[] = []) => {
      sql.push({ text, params });
      if (fail?.test(text)) throw Object.assign(new Error('relation "transactions" row (1, "Coffee", 4.50) failed'), { code: 'XX000' });
      if (text.includes('information_schema.columns')) return { rowCount: 1, rows: [{ present }] };
      if (text.startsWith('SELECT id, transaction_retention_terms')) return { rowCount: optedIn.length, rows: optedIn };
      if (text.includes('DELETE FROM transactions')) return { rowCount: deleted.length, rows: deleted };
      return { rowCount: 0, rows: [] };
    });
    mock.method(logger, 'audit', (message: string, data: unknown = null) => { audits.push(message); if (data) printed.push(JSON.stringify(data)); });
    mock.method(logger, 'info', (message: string) => printed.push(message));
    mock.method(console, 'log', (...a: unknown[]) => printed.push(a.map(String).join(' ')));
  });
  afterEach(() => mock.restoreAll());

  const deletes = () => sql.filter((q) => /DELETE/.test(q.text));

  test('without migration 016: the probe, and nothing else', async () => {
    present = false;
    assert.equal(await retentionService.deleteExpiredTransactions(now), 0);
    assert.equal(sql.length, 1);
    assert.match(sql[0]!.text, /information_schema\.columns/);
  });

  test('nobody opted in (everyone\'s default): one SELECT on users, no DELETE', async () => {
    assert.equal(await retentionService.deleteExpiredTransactions(now), 0);
    assert.deepEqual(deletes(), []);
    const read = sql.find((q) => q.text.startsWith('SELECT id'))!;
    assert.match(read.text, /transaction_retention_terms IS NOT NULL AND NOT is_demo/);
  });

  test('the probe is cached once positive, never while negative', async () => {
    present = false;
    await retentionService.deleteExpiredTransactions(now);
    await retentionService.deleteExpiredTransactions(now);
    assert.equal(sql.filter((q) => q.text.includes('information_schema')).length, 2);
    present = true;
    await retentionService.deleteExpiredTransactions(now);
    await retentionService.deleteExpiredTransactions(now);
    assert.equal(sql.filter((q) => q.text.includes('information_schema')).length, 3);
  });

  test('one set-based DELETE of transactions only, with each user\'s cutoff from terms.ts', async () => {
    optedIn = [{ id: 7, terms: 3 }, { id: 8, terms: 12 }, { id: 9, terms: 4 }];
    deleted = [{ user_id: 7, deleted: 3 }, { user_id: 8, deleted: 2 }];
    assert.equal(await retentionService.deleteExpiredTransactions(now), 5);
    const [statement, ...others] = deletes();
    assert.equal(others.length, 0);
    assert.match(statement!.text, /DELETE FROM transactions tx USING victims/);
    assert.doesNotMatch(statement!.text, /DELETE FROM (users|savings_goals|agent_|import_batches|access_tokens)/);
    // A value Settings does not offer (4) is never acted on.
    assert.deepEqual(statement!.params, [[7, 8], [3, 12], ['2026-01-01', '2023-01-01'], config.dataRetention.transactionRetentionBatch]);
    // Re-checked inside the statement: the setting as it stands, and never the demo account.
    assert.match(statement!.text, /u\.transaction_retention_terms = t\.terms/);
    assert.match(statement!.text, /NOT u\.is_demo/);
    assert.match(statement!.text, /tx\.date < t\.cutoff/);
    assert.match(statement!.text, /LIMIT \$4/);
  });

  test('the audit log is a user id and a count per user, and nothing from any row', async () => {
    optedIn = [{ id: 7, terms: 3 }];
    deleted = [{ user_id: 7, deleted: 3 }];
    await retentionService.deleteExpiredTransactions(now);
    assert.deepEqual(audits, ['transactionRetention: user 7 deleted 3 transaction(s)']);
    assert.deepEqual(printed, []);
    // The statement hands back only user ids, so a row's description, amount
    // or date cannot reach a log through it.
    assert.match(deletes()[0]!.text, /RETURNING tx\.user_id\s*\)/);
  });

  test('throws on a database error rather than reporting zero', async () => {
    optedIn = [{ id: 7, terms: 3 }];
    fail = /DELETE FROM transactions/;
    await assert.rejects(retentionService.deleteExpiredTransactions(now), /failed/);
  });
});

describe('in the hourly maintenance run', () => {
  let errors: string[];
  let audits: string[];
  let savedDemo: boolean;
  let savedAgent: boolean;
  let fail: RegExp;
  let sql: string[];

  beforeEach(() => {
    process.env.TZ = 'UTC';
    retentionService.resetRetentionProbe();
    savedDemo = config.demo.refreshEnabled;
    savedAgent = config.agent.enabled;
    config.demo.refreshEnabled = false;
    config.agent.enabled = false;
    errors = [];
    audits = [];
    sql = [];
    mock.method(logger, 'info', () => {});
    mock.method(logger, 'audit', (message: string) => audits.push(message));
    mock.method(logger, 'error', (message: string) => errors.push(message));
    mock.method(db, 'query', async (text: string) => {
      sql.push(text);
      if (fail.test(text)) throw new Error('connection terminated');
      if (text.includes('information_schema.columns')) return { rowCount: 1, rows: [{ present: true }] };
      if (text.startsWith('SELECT id, transaction_retention_terms')) return { rowCount: 1, rows: [{ id: 7, terms: 3 }] };
      if (text.includes('DELETE FROM transactions')) return { rowCount: 1, rows: [{ user_id: 7, deleted: 4 }] };
      return { rowCount: 2, rows: [] };
    });
  });
  afterEach(() => {
    config.demo.refreshEnabled = savedDemo;
    config.agent.enabled = savedAgent;
    mock.restoreAll();
  });

  test('a failed retention step is logged and does not stop the account cleanup', async () => {
    fail = /DELETE FROM transactions/;
    const result = await scheduler.runMaintenance();
    assert.deepEqual(result, { unverifiedAccounts: 2, transactionRetention: null });
    assert.deepEqual(errors, ['transactionRetention failed']);
    assert.ok(sql.some((text) => text.startsWith('DELETE FROM users')));
  });

  test('a failed account cleanup does not stop the retention step', async () => {
    fail = /^DELETE FROM users/;
    const result = await scheduler.runMaintenance();
    assert.deepEqual(result, { unverifiedAccounts: null, transactionRetention: 4 });
    assert.deepEqual(errors, ['accountCleanup failed']);
    assert.ok(audits.includes('transactionRetention: deleted 4 row(s)'));
  });
});
