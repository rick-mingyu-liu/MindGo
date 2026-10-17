import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import { packageRoot } from '../utils/packageRoot';

// The all-users daily cap counts every user's admissions, so in the shared
// test database other test files (run in parallel by node --test) add and
// delete admissions while this test runs; deletions take no advisory lock, so
// a cap computed from a shared count could leave two slots. This file runs in
// its own process with its own schema (DB_SCHEMA, set before config loads), so
// the count starts at zero and nothing else touches it: exactly one admission
// fits, and with the advisory lock in beginTurn removed, every user is admitted.
const url = process.env.TEST_DATABASE_URL;
const schema = `agent_capacity_${randomUUID().replaceAll('-', '')}`;
if (url) { process.env.DATABASE_URL = url; process.env.DB_SCHEMA = schema; process.env.NODE_ENV = 'test'; }

test('the all-users daily budget admits exactly the remaining turn under concurrency', { skip: !url }, async () => {
  const admin = new Pool({ connectionString: url });
  const desired = readFileSync(path.join(packageRoot(__dirname), 'db/schema.sql'), 'utf8');
  const setup = await admin.connect();
  try {
    await setup.query(`CREATE SCHEMA ${schema}`);
    await setup.query(`SET search_path TO ${schema}`);
    await setup.query(desired);
  } finally { await setup.query('SET search_path TO public'); setup.release(); }
  const config: typeof import('../config') = require('../config');
  const db: typeof import('../db/connection') = require('../db/connection');
  const store: typeof import('../services/agent/store') = require('../services/agent/store');
  try {
    assert.equal(config.database.schema, schema);
    const settings = { currency: 'CAD', timezone: 'America/Toronto', language: 'auto' as const };
    const turns: Array<{ user: number; id: string; requestId: string }> = [];
    for (let n = 0; n < 4; n++) {
      const user = (await db.query<{ id: number }>("INSERT INTO users(email,password_hash,first_name,last_name) VALUES($1,'x','Capacity','Test') RETURNING id", [`agent-${randomUUID()}@example.invalid`])).rows[0]!.id;
      turns.push({ user, id: (await store.createConversation(user, settings)).id, requestId: randomUUID() });
    }
    assert.equal((await db.query<{ count: string }>('SELECT count(*) FROM agent_admissions')).rows[0]!.count, '0');
    const saved = config.agent.maxTurnsPerDayAllUsers;
    config.agent.maxTurnsPerDayAllUsers = 1;
    let attempts: PromiseSettledResult<unknown>[] = [];
    try {
      attempts = await Promise.allSettled(turns.map(t => store.beginTurn(t.user, t.id, { ...settings, requestId: t.requestId, content: 'Fictional coffee' })));
    } finally { config.agent.maxTurnsPerDayAllUsers = saved; }
    assert.equal(attempts.filter(r => r.status === 'fulfilled').length, 1, 'exactly one turn admitted for one slot');
    for (const r of attempts) if (r.status === 'rejected') assert.deepEqual({ code: r.reason.code, status: r.reason.status }, { code: 'agent_daily_capacity', status: 429 });
    assert.equal((await db.query<{ count: string }>('SELECT count(*) FROM agent_admissions')).rows[0]!.count, '1');
  } finally {
    await db.getPool().end();
    await admin.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`);
    await admin.end();
  }
});
