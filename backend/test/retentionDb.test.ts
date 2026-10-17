import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool, type PoolClient } from 'pg';
import { packageRoot } from '../utils/packageRoot';
import db = require('../db/connection');
import config = require('../config');
import logger = require('../utils/logger');
import * as retentionService from '../services/retentionService';

/**
 * The automatic-deletion sweep's real statement against PostgreSQL: only the
 * opted-in users' transactions dated before their own cutoff go; the cutoff
 * day itself, other users, opted-out users, the demo account and every other
 * table are untouched; the per-run cap holds; and turning the setting off
 * stops the next run.
 *
 * Needs an explicit TEST_DATABASE_URL, never the .env database. Everything runs
 * in a random schema built from schema.sql and dropped afterwards; db.query is
 * routed to a client whose search_path is that schema, so no other test's
 * users (or a seeded demo account) are ever in reach.
 */
const enabled = !!process.env.TEST_DATABASE_URL;

describe('transaction retention against the database', { skip: !enabled }, () => {
  let pool: Pool;
  let client: PoolClient;
  const schema = `retention_${randomUUID().replaceAll('-', '')}`;
  // Mid-Fall 2026: three terms keep 2026, six keep 2025 and 2026.
  const now = new Date(Date.UTC(2026, 9, 16, 12));
  let savedBatch: number;

  before(async () => {
    pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
    client = await pool.connect();
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(readFileSync(path.join(packageRoot(__dirname), 'db/schema.sql'), 'utf8'));
  });
  after(async () => {
    if (!client) return;
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release();
    await pool.end();
  });

  beforeEach(async () => {
    retentionService.resetRetentionProbe();
    savedBatch = config.dataRetention.transactionRetentionBatch;
    mock.method(db, 'query', (text: string, params?: unknown[]) => client.query(text, params));
    mock.method(logger, 'audit', () => {});
    await client.query('TRUNCATE users RESTART IDENTITY CASCADE');
  });
  afterEach(() => {
    config.dataRetention.transactionRetentionBatch = savedBatch;
    mock.restoreAll();
  });

  async function user(name: string, terms: number | null, demo = false): Promise<number> {
    return (await client.query<{ id: number }>(
      `INSERT INTO users(email,password_hash,first_name,last_name,transaction_retention_terms,is_demo)
       VALUES($1,'x',$2,'Retention',$3,$4) RETURNING id`,
      [`${name}-${randomUUID()}@example.invalid`, name, terms, demo]
    )).rows[0]!.id;
  }
  async function rows(userId: number, ...dates: string[]): Promise<void> {
    for (const date of dates) {
      await client.query(
        "INSERT INTO transactions(user_id,amount,description,category,type,date,currency) VALUES($1,10.00,'Fictional','Groceries','expense',$2,'CAD')",
        [userId, date]
      );
    }
  }
  const datesOf = async (userId: number): Promise<string[]> =>
    (await client.query<{ date: string }>("SELECT to_char(date,'YYYY-MM-DD') AS date FROM transactions WHERE user_id=$1 ORDER BY date", [userId])).rows.map((r) => r.date);

  test('deletes only what is older than each opted-in user\'s boundary', async () => {
    const alice = await user('alice', 3);
    const carol = await user('carol', 6);
    const bob = await user('bob', null);
    const demo = await user('demo', 3, true);
    await rows(alice, '2024-05-01', '2025-12-31', '2026-01-01', '2026-10-01');
    await rows(carol, '2024-12-31', '2025-01-01', '2026-02-01');
    await rows(bob, '2019-01-01', '2025-12-31');
    await rows(demo, '2019-01-01', '2025-12-31');
    await client.query("INSERT INTO savings_goals(user_id,name,target_amount,target_date) VALUES($1,'Fictional goal',100,'2020-01-01')", [alice]);

    const deleted = await retentionService.deleteExpiredTransactions(now);
    assert.equal(deleted, 3);
    assert.deepEqual(await datesOf(alice), ['2026-01-01', '2026-10-01'], 'the cutoff day itself is kept');
    assert.deepEqual(await datesOf(carol), ['2025-01-01', '2026-02-01']);
    assert.deepEqual(await datesOf(bob), ['2019-01-01', '2025-12-31'], 'an opted-out user lost rows');
    assert.deepEqual(await datesOf(demo), ['2019-01-01', '2025-12-31'], 'the demo account lost rows');
    assert.equal((await client.query('SELECT count(*)::int AS n FROM savings_goals')).rows[0].n, 1, 'goals are not transactions');

    // Nothing left to do: a second run deletes nothing.
    assert.equal(await retentionService.deleteExpiredTransactions(now), 0);
  });

  test('the per-run cap is honoured, and the rest go on later runs', async () => {
    config.dataRetention.transactionRetentionBatch = 2;
    const alice = await user('alice', 3);
    await rows(alice, '2021-01-01', '2022-01-01', '2023-01-01', '2024-01-01', '2026-03-01');
    assert.equal(await retentionService.deleteExpiredTransactions(now), 2);
    assert.equal(await retentionService.deleteExpiredTransactions(now), 2);
    assert.equal(await retentionService.deleteExpiredTransactions(now), 0);
    assert.deepEqual(await datesOf(alice), ['2026-03-01']);
  });

  test('turning it off through setRetention stops the sweep; the preview counts the same rows', async () => {
    const alice = await user('alice', null);
    await rows(alice, '2020-01-01', '2025-06-01', '2026-06-01');
    assert.equal((await retentionService.previewRetention(alice, 3, now)).count, 2);
    assert.equal((await retentionService.getRetention(alice, now)).retentionTerms, null);
    await retentionService.setRetention(alice, 3, now);
    assert.equal((await retentionService.getRetention(alice, now)).retentionTerms, 3);
    await retentionService.setRetention(alice, null, now);
    assert.equal(await retentionService.deleteExpiredTransactions(now), 0);
    assert.equal((await datesOf(alice)).length, 3);
    await retentionService.setRetention(alice, 3, now);
    assert.equal(await retentionService.deleteExpiredTransactions(now), 2);
  });

  test('the demo account cannot turn it on, and the database refuses a value outside 3-12', async () => {
    const demo = await user('demo', null, true);
    await assert.rejects(retentionService.setRetention(demo, 3, now), retentionService.RetentionDemoError);
    assert.equal((await retentionService.getRetention(demo, now)).retentionTerms, null);
    await assert.rejects(client.query('UPDATE users SET transaction_retention_terms = 1 WHERE id = $1', [demo]), { code: '23514' });
  });
});
