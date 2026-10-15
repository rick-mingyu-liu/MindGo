import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { packageRoot } from '../utils/packageRoot';

/**
 * Migration 014 drops the retired watchlist and ai_plans tables. Applied twice
 * to a database that has them (the pre-014 shape, with rows in them) and twice
 * to one that never did (a fresh schema.sql), it must succeed every time, drop
 * exactly those two tables, report counts only, and leave every other table and
 * its rows alone.
 *
 * Needs an explicit TEST_DATABASE_URL, never the .env database. All DDL runs in
 * a random schema that is dropped afterwards.
 */

// The two tables as schema.sql defined them before 014.
const LEGACY = `
CREATE TABLE watchlist (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    symbol VARCHAR(20) NOT NULL,
    company_name VARCHAR(255),
    added_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(user_id, symbol)
);
CREATE TABLE ai_plans (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    prompt TEXT NOT NULL,
    response TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_watchlist_user_id ON watchlist(user_id);
CREATE INDEX idx_ai_plans_user_id ON ai_plans(user_id);
`;

// Every notice is a count or an absence (ours, or Postgres' own for IF EXISTS); none quotes a row.
const NOTICE = /^((watchlist|ai_plans): (dropping \d+ row\(s\)|absent, nothing to drop)|table "(watchlist|ai_plans)" does not exist, skipping)$/;

test('migration 014: drops both tables twice over, and is a no-op where they never existed', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  const schema = `drop_watchlist_${randomUUID().replaceAll('-', '')}`;
  const root = packageRoot(__dirname);
  const desired = readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
  const migration = readFileSync(path.join(root, 'db/migrations/014_drop_watchlist_ai_plans.sql'), 'utf8');
  const notices: string[] = [];
  client.on('notice', (n) => notices.push(n.message ?? ''));

  const tables = async (): Promise<string[]> =>
    (await client.query<{ table_name: string }>(
      'SELECT table_name FROM information_schema.tables WHERE table_schema = $1 ORDER BY table_name', [schema]
    )).rows.map((r) => r.table_name);
  const relations = async (): Promise<string[]> =>
    (await client.query<{ relname: string }>(
      `SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
       WHERE n.nspname = $1 AND (c.relname LIKE '%watchlist%' OR c.relname LIKE '%ai_plans%')`, [schema]
    )).rows.map((r) => r.relname);

  try {
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);

    // Pre-014: the current schema plus the two legacy tables, with rows.
    await client.query(desired);
    const current = await tables();
    assert.ok(!current.includes('watchlist') && !current.includes('ai_plans'), 'schema.sql still creates a dropped table');
    await client.query(LEGACY);
    const user = (await client.query<{ id: number }>(
      "INSERT INTO users(email,password_hash,first_name,last_name) VALUES('fiction@example.invalid','x','Migration','Test') RETURNING id"
    )).rows[0]!.id;
    await client.query("INSERT INTO transactions(user_id,amount,description,category,type,date,currency) VALUES($1,12.50,'Fictional','Dining Out','expense','2026-10-14','CAD')", [user]);
    await client.query("INSERT INTO savings_goals(user_id,name,target_amount,target_date) VALUES($1,'Fictional goal',100,'2027-01-01')", [user]);
    await client.query("INSERT INTO watchlist(user_id,symbol) VALUES($1,'AAA'),($1,'BBB')", [user]);
    await client.query("INSERT INTO ai_plans(user_id,prompt,response) VALUES($1,'p','r')", [user]);

    await client.query(migration);
    assert.ok(notices.some((n) => n === 'watchlist: dropping 2 row(s)'), notices.join('\n'));
    assert.ok(notices.some((n) => n === 'ai_plans: dropping 1 row(s)'), notices.join('\n'));
    for (const n of notices) assert.match(n, NOTICE);
    notices.length = 0;
    await client.query(migration);
    assert.ok(notices.includes('watchlist: absent, nothing to drop'), notices.join('\n'));
    assert.ok(notices.includes('ai_plans: absent, nothing to drop'), notices.join('\n'));
    for (const n of notices) assert.match(n, NOTICE);

    assert.deepEqual(await tables(), current);
    assert.deepEqual(await relations(), [], 'an index or sequence outlived its table');
    assert.equal((await client.query('SELECT count(*) FROM users')).rows[0].count, '1');
    assert.equal((await client.query('SELECT count(*) FROM transactions')).rows[0].count, '1');
    assert.equal((await client.query('SELECT count(*) FROM savings_goals')).rows[0].count, '1');

    // Fresh: a database built from today's schema.sql never had them.
    await client.query(`DROP SCHEMA ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
    await client.query(desired);
    await client.query(migration);
    await client.query(migration);
    assert.deepEqual(await tables(), current);
  } finally {
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release();
    await pool.end();
  }
});
