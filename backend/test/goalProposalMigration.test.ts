import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { packageRoot } from '../utils/packageRoot';

/**
 * Migration 015 adds agent_goal_proposals. Applied twice to main's schema (with
 * rows in it) and twice to a fresh schema.sql, it must succeed every time,
 * produce exactly the table schema.sql declares, and touch no existing row.
 * It refuses a database without migration 013.
 *
 * Needs an explicit TEST_DATABASE_URL, never the .env database. All DDL runs in
 * a random schema that is dropped afterwards.
 */
const MARKER = '-- Planning: savings-goal changes Pocky proposes.';

test('migration 015: idempotent on main\'s schema and on a fresh one, and matches schema.sql', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const pool = new Pool({ connectionString: process.env.TEST_DATABASE_URL });
  const client = await pool.connect();
  const schema = `goal_proposals_${randomUUID().replaceAll('-', '')}`;
  const root = packageRoot(__dirname);
  const desired = readFileSync(path.join(root, 'db/schema.sql'), 'utf8');
  const migration = readFileSync(path.join(root, 'db/migrations/015_agent_goal_proposals.sql'), 'utf8');
  assert.ok(desired.includes(MARKER), 'schema.sql lost the planning marker this test splits on');
  const main = desired.split(MARKER)[0]!;

  const shape = async () => (await client.query(
    `SELECT column_name, data_type, is_nullable, column_default FROM information_schema.columns
     WHERE table_schema = $1 AND table_name = 'agent_goal_proposals' ORDER BY ordinal_position`, [schema])).rows;
  const constraints = async () => (await client.query(
    `SELECT pg_get_constraintdef(c.oid) AS def FROM pg_constraint c JOIN pg_class t ON t.oid = c.conrelid JOIN pg_namespace n ON n.oid = t.relnamespace
     WHERE n.nspname = $1 AND t.relname = 'agent_goal_proposals' ORDER BY 1`, [schema])).rows;
  const reset = async () => {
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}`);
  };

  try {
    // Fresh: schema.sql already has the table; the migration is a no-op twice.
    await reset();
    await client.query(desired);
    const expectedShape = await shape();
    const expectedConstraints = await constraints();
    assert.ok(expectedShape.length > 0);
    await client.query(migration);
    await client.query(migration);
    assert.deepEqual(await shape(), expectedShape);

    // Main's schema, with data: the migration adds the table and changes nothing else.
    await reset();
    await client.query(main);
    assert.deepEqual(await shape(), []);
    const user = (await client.query<{ id: number }>("INSERT INTO users(email,password_hash,first_name,last_name) VALUES('fiction@example.invalid','x','Migration','Test') RETURNING id")).rows[0]!.id;
    await client.query("INSERT INTO savings_goals(user_id,name,target_amount,target_date) VALUES($1,'Fictional goal',100,'2027-01-01')", [user]);
    const conversation = randomUUID();
    await client.query("INSERT INTO agent_conversations(id,user_id,currency,timezone,language) VALUES($1,$2,'CAD','UTC','auto')", [conversation, user]);
    const goalsBefore = (await client.query('SELECT * FROM savings_goals')).rows;
    await client.query(migration);
    await client.query(migration);
    assert.deepEqual(await shape(), expectedShape);
    assert.deepEqual(await constraints(), expectedConstraints);
    assert.deepEqual((await client.query('SELECT * FROM savings_goals')).rows, goalsBefore);
    // The table works and cascades with its conversation.
    await client.query(`INSERT INTO agent_goal_proposals(id,conversation_id,user_id,action,after) VALUES($1,$2,$3,'create','{"name":"x"}')`, [randomUUID(), conversation, user]);
    await assert.rejects(client.query(`INSERT INTO agent_goal_proposals(id,conversation_id,user_id,action,after) VALUES($1,$2,$3,'update','{}')`, [randomUUID(), conversation, user]), { code: '23514' });
    await client.query('DELETE FROM agent_conversations WHERE id=$1', [conversation]);
    assert.equal((await client.query('SELECT count(*) FROM agent_goal_proposals')).rows[0].count, '0');
    assert.equal((await client.query('SELECT count(*) FROM savings_goals')).rows[0].count, '1');

    // Without migration 013 it refuses rather than half-applying.
    await reset();
    await client.query(desired.split('-- Conversation records never own saved transactions:')[0]!);
    await assert.rejects(client.query(migration), (error: unknown) => error instanceof Error && error.message.includes('Apply migration 013'));
    await client.query('ROLLBACK');
    assert.deepEqual(await shape(), []);
  } finally {
    await client.query('ROLLBACK');
    await client.query('SET search_path TO public');
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    client.release();
    await pool.end();
  }
});
