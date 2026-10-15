import { test, before, beforeEach, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import type { GoalProposalDraft } from '../services/agent/types';
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test'; }

/**
 * Goal proposals against real PostgreSQL: only the Confirm button writes a
 * goal, exactly once, and only while the goal is still what was proposed
 * against. Needs an explicit TEST_DATABASE_URL; records are fictional.
 */
describe('agent goal proposals', { skip: !enabled }, () => {
  let store: typeof import('../services/agent/store');
  let planning: typeof import('../services/agent/planning');
  let db: typeof import('../db/connection');
  const users: number[] = [];
  let alice: number; let bob: number;
  const settings = { currency: 'CAD', timezone: 'America/Toronto', language: 'auto' as const };
  const today = '2026-10-14';
  const fields = { name: 'Fictional trip', target_amount: '2000.00', current_amount: '0.00', currency: 'CAD', target_date: '2027-05-01', description: null };
  const createDraft = (over: Partial<typeof fields> = {}): GoalProposalDraft => ({ action: 'create', goal_id: null, expected_updated_at: null, before: null, after: { ...fields, ...over } });

  /** One finished turn that proposed `draft`, in a new conversation unless one is given. */
  async function propose(user: number, draft: GoalProposalDraft, conversationId?: string, timezone = settings.timezone) {
    const id = conversationId ?? (await store.createConversation(user, settings)).id;
    const requestId = randomUUID();
    // Each turn sets the conversation's timezone, which confirmation then judges "today" by.
    await store.beginTurn(user, id, { ...settings, timezone, requestId, content: 'Fictional goal request' });
    return store.finishTurn(user, id, requestId, { text: 'Please review the goal.', goalProposal: draft });
  }
  const goalCount = async (user: number) => Number((await db.query<{ count: string }>('SELECT count(*) FROM savings_goals WHERE user_id=$1', [user])).rows[0]!.count);
  async function goal(user: number, name = 'Fictional laptop') {
    return (await db.query<{ id: number }>("INSERT INTO savings_goals(user_id,name,target_amount,current_amount,target_date,currency) VALUES($1,$2,1500,200,'2027-04-30','CAD') RETURNING id", [user, name])).rows[0]!.id;
  }

  before(async () => {
    store = require('../services/agent/store'); planning = require('../services/agent/planning'); db = require('../db/connection');
    for (let n = 0; n < 2; n++) users.push((await db.query<{ id: number }>("INSERT INTO users(email,password_hash,first_name,last_name) VALUES($1,'x','Goal','Test') RETURNING id", [`goal-${randomUUID()}@example.invalid`])).rows[0]!.id);
    alice = users[0]!; bob = users[1]!;
  });
  beforeEach(async () => { await db.query('DELETE FROM agent_admissions WHERE user_id=ANY($1::int[])', [users]); });
  after(async () => { if (db) { await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]); await db.getPool().end(); } });

  test('a create proposal is pending until confirmed, then inserts exactly one goal; an exact replay is idempotent', async () => {
    const s = await propose(alice, createDraft());
    const proposal = s.goalProposal!;
    assert.equal(proposal.status, 'pending');
    assert.equal(proposal.action, 'create');
    assert.deepEqual(proposal.after, fields);
    assert.equal(proposal.before, null);
    assert.equal(proposal.result_goal_id, null);
    const before = await goalCount(alice);
    const input = { proposalId: proposal.id, requestId: randomUUID() };
    const confirmed = await store.confirmGoalProposal(alice, s.conversation.id, input);
    assert.equal(confirmed.goalProposal!.status, 'confirmed');
    const goalId = confirmed.goalProposal!.result_goal_id!;
    const saved = (await db.query('SELECT user_id,name,target_amount,current_amount,currency,target_date,description FROM savings_goals WHERE id=$1', [goalId])).rows[0];
    assert.deepEqual(saved, { user_id: alice, name: 'Fictional trip', target_amount: '2000.00', current_amount: '0.00', currency: 'CAD', target_date: '2027-05-01', description: null });
    const replay = await store.confirmGoalProposal(alice, s.conversation.id, input);
    assert.equal(replay.goalProposal!.result_goal_id, goalId);
    assert.equal(await goalCount(alice), before + 1);
    // The same request ID for another proposal is a different request.
    const other = await propose(alice, createDraft({ name: 'Other' }));
    await assert.rejects(store.confirmGoalProposal(alice, other.conversation.id, { proposalId: other.goalProposal!.id, requestId: input.requestId }), { code: 'agent_request_conflict' });
    // A decided proposal cannot be confirmed or cancelled again under a new request.
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, { proposalId: proposal.id, requestId: randomUUID() }), { code: 'agent_version_conflict' });
    await assert.rejects(store.cancelGoalProposal(alice, s.conversation.id, proposal.id), { code: 'agent_version_conflict' });
  });

  test('concurrent confirmations with the same request ID create one goal and both answer it', async () => {
    const s = await propose(alice, createDraft({ name: 'Same request' }));
    const before = await goalCount(alice);
    const input = { proposalId: s.goalProposal!.id, requestId: randomUUID() };
    const results = await Promise.all([store.confirmGoalProposal(alice, s.conversation.id, input), store.confirmGoalProposal(alice, s.conversation.id, input)]);
    assert.equal(results[0]!.goalProposal!.result_goal_id, results[1]!.goalProposal!.result_goal_id);
    assert.equal(results[0]!.goalProposal!.status, 'confirmed');
    assert.equal(await goalCount(alice), before + 1);
  });

  test('a create whose target date has passed in the conversation timezone is refused at confirmation', async () => {
    const s = await propose(alice, createDraft({ name: 'Too late', target_date: '2026-01-01' }));
    const before = await goalCount(alice);
    const input = { proposalId: s.goalProposal!.id, requestId: randomUUID() };
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, input), { code: 'agent_goal_invalid', status: 409 });
    assert.equal((await store.getConversation(alice, s.conversation.id)).goalProposal!.status, 'conflict');
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, input), { code: 'agent_goal_invalid' });
    assert.equal(await goalCount(alice), before);
    // "Today" is the conversation's. Kiritimati (UTC+14) is always exactly one
    // calendar day ahead of Honolulu (UTC-10), so Honolulu's today is already
    // past in Kiritimati at the same instant.
    const day = (await db.query<{ day: string }>("SELECT to_char((now() AT TIME ZONE 'Pacific/Kiritimati')::date - 1, 'YYYY-MM-DD') AS day")).rows[0]!.day;
    const honolulu = (await db.query<{ day: string }>("SELECT to_char((now() AT TIME ZONE 'Pacific/Honolulu')::date, 'YYYY-MM-DD') AS day")).rows[0]!.day;
    assert.equal(day, honolulu);
    {
      const east = await store.createConversation(alice, { ...settings, timezone: 'Pacific/Kiritimati' });
      const west = await store.createConversation(alice, { ...settings, timezone: 'Pacific/Honolulu' });
      const e = await propose(alice, createDraft({ name: 'East', target_date: day }), east.id, 'Pacific/Kiritimati');
      const w = await propose(alice, createDraft({ name: 'West', target_date: day }), west.id, 'Pacific/Honolulu');
      await assert.rejects(store.confirmGoalProposal(alice, east.id, { proposalId: e.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_goal_invalid' });
      assert.equal((await store.confirmGoalProposal(alice, west.id, { proposalId: w.goalProposal!.id, requestId: randomUUID() })).goalProposal!.status, 'confirmed');
    }
  });

  test('concurrent confirmations with different request IDs create one goal', async () => {
    const s = await propose(alice, createDraft({ name: 'Concurrent' }));
    const before = await goalCount(alice);
    const attempts = await Promise.allSettled([randomUUID(), randomUUID()].map(requestId => store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId })));
    assert.equal(attempts.filter(a => a.status === 'fulfilled').length, 1);
    const refused = attempts.filter(a => a.status === 'rejected') as PromiseRejectedResult[];
    assert.equal(refused.length, 1);
    assert.equal(refused[0]!.reason.code, 'agent_version_conflict');
    assert.equal(await goalCount(alice), before + 1);
  });

  test('an update applies only at the proposed version and only to the owner\'s goal', async () => {
    const id = await goal(alice);
    const draft = await planning.prepareGoalProposal(alice, { action: 'update', goal_id: id, expected_updated_at: (await db.query<{ v: string }>(`SELECT to_char(updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS v FROM savings_goals WHERE id=$1`, [id])).rows[0]!.v, name: 'Fictional laptop', target_amount: '1800', currency: 'CAD' }, today);
    const s = await propose(alice, draft);
    assert.deepEqual(s.goalProposal!.before, { name: 'Fictional laptop', target_amount: '1500.00', current_amount: '200.00', currency: 'CAD', target_date: '2027-04-30', description: null });
    const confirmed = await store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId: randomUUID() });
    assert.equal(confirmed.goalProposal!.result_goal_id, id);
    assert.equal((await db.query('SELECT target_amount FROM savings_goals WHERE id=$1', [id])).rows[0]!.target_amount, '1800.00');
    // Bob cannot read Alice's goal through the tool.
    await assert.rejects(planning.prepareGoalProposal(bob, { action: 'update', goal_id: id, expected_updated_at: draft.expected_updated_at, name: 'x', target_amount: '1', currency: 'CAD' }, today), { code: 'agent_goal_not_found' });
  });

  test('a stale updated_at, even by a microsecond, marks the proposal conflict and changes nothing', async () => {
    const id = await goal(alice);
    const version = (await db.query<{ v: string }>(`SELECT to_char(updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS v FROM savings_goals WHERE id=$1`, [id])).rows[0]!.v;
    const s = await propose(alice, await planning.prepareGoalProposal(alice, { action: 'update', goal_id: id, expected_updated_at: version, name: 'Renamed', target_amount: '1500', currency: 'CAD' }, today));
    await db.query("UPDATE savings_goals SET updated_at=updated_at+interval '1 microsecond' WHERE id=$1", [id]);
    const before = (await db.query('SELECT * FROM savings_goals WHERE id=$1', [id])).rows[0];
    const input = { proposalId: s.goalProposal!.id, requestId: randomUUID() };
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, input), { code: 'agent_goal_conflict', status: 409 });
    assert.deepEqual((await db.query('SELECT * FROM savings_goals WHERE id=$1', [id])).rows[0], before);
    assert.equal((await store.getConversation(alice, s.conversation.id)).goalProposal!.status, 'conflict');
    // Replaying the same request answers the same conflict; nothing is written.
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, input), { code: 'agent_goal_conflict' });
    assert.deepEqual((await db.query('SELECT * FROM savings_goals WHERE id=$1', [id])).rows[0], before);
  });

  test('a deleted goal conflicts, and another user\'s goal id stored in a proposal is never touched', async () => {
    const id = await goal(alice);
    const version = (await db.query<{ v: string }>(`SELECT to_char(updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS v FROM savings_goals WHERE id=$1`, [id])).rows[0]!.v;
    const s = await propose(alice, await planning.prepareGoalProposal(alice, { action: 'update', goal_id: id, expected_updated_at: version, name: 'Renamed', target_amount: '1500', currency: 'CAD' }, today));
    await db.query('DELETE FROM savings_goals WHERE id=$1', [id]);
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_goal_conflict' });
    assert.equal((await db.query('SELECT id FROM savings_goals WHERE id=$1', [id])).rowCount, 0);

    // Even a proposal naming Bob's goal with its exact version cannot change it.
    const bobs = await goal(bob, 'Bob only');
    const bobVersion = (await db.query<{ v: string }>(`SELECT to_char(updated_at,'YYYY-MM-DD HH24:MI:SS.US') AS v FROM savings_goals WHERE id=$1`, [bobs])).rows[0]!.v;
    const forged: GoalProposalDraft = { action: 'update', goal_id: bobs, expected_updated_at: bobVersion, before: { ...fields, name: 'Bob only' }, after: { ...fields, name: 'Taken' } };
    const f = await propose(alice, forged);
    const untouched = (await db.query('SELECT * FROM savings_goals WHERE id=$1', [bobs])).rows[0];
    await assert.rejects(store.confirmGoalProposal(alice, f.conversation.id, { proposalId: f.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_goal_conflict' });
    assert.deepEqual((await db.query('SELECT * FROM savings_goals WHERE id=$1', [bobs])).rows[0], untouched);
    // And Bob cannot confirm or cancel Alice's proposal.
    const mine = await propose(alice, createDraft());
    await assert.rejects(store.confirmGoalProposal(bob, mine.conversation.id, { proposalId: mine.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_not_found' });
    await assert.rejects(store.cancelGoalProposal(bob, mine.conversation.id, mine.goalProposal!.id), { code: 'agent_not_found' });
  });

  test('a new proposal supersedes the pending one; only the latest can be confirmed or cancelled', async () => {
    const first = await propose(alice, createDraft({ name: 'First' }));
    const second = await propose(alice, createDraft({ name: 'Second' }), first.conversation.id);
    assert.equal(second.goalProposal!.after.name, 'Second');
    assert.equal((await db.query("SELECT status FROM agent_goal_proposals WHERE id=$1", [first.goalProposal!.id])).rows[0]!.status, 'superseded');
    await assert.rejects(store.confirmGoalProposal(alice, first.conversation.id, { proposalId: first.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_version_conflict' });
    await assert.rejects(store.cancelGoalProposal(alice, first.conversation.id, first.goalProposal!.id), { code: 'agent_version_conflict' });
    // A turn without a proposal leaves the pending one alone.
    const requestId = randomUUID();
    await store.beginTurn(alice, first.conversation.id, { ...settings, requestId, content: 'Fictional question' });
    const later = await store.finishTurn(alice, first.conversation.id, requestId, { text: 'An answer.' });
    assert.equal(later.goalProposal!.id, second.goalProposal!.id);
    const cancelled = await store.cancelGoalProposal(alice, first.conversation.id, second.goalProposal!.id);
    assert.equal(cancelled.goalProposal!.status, 'cancelled');
  });

  test('a running turn blocks the buttons, and a cancelled run cannot publish its proposal', async () => {
    const s = await propose(alice, createDraft());
    const runId = randomUUID();
    await store.beginTurn(alice, s.conversation.id, { ...settings, requestId: runId, content: 'Fictional change' });
    try {
      await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_busy' });
      await assert.rejects(store.cancelGoalProposal(alice, s.conversation.id, s.goalProposal!.id), { code: 'agent_busy' });
    } finally { await store.cancelRun(alice, s.conversation.id, runId); }
    await assert.rejects(store.finishTurn(alice, s.conversation.id, runId, { text: 'late', goalProposal: createDraft({ name: 'Late' }) }), { code: 'agent_cancelled' });
    assert.equal((await store.getConversation(alice, s.conversation.id)).goalProposal!.id, s.goalProposal!.id);
    // finishTurn re-validates: a malformed draft never reaches storage.
    const r = randomUUID();
    await store.beginTurn(alice, s.conversation.id, { ...settings, requestId: r, content: 'Fictional' });
    await assert.rejects(store.finishTurn(alice, s.conversation.id, r, { text: 'x', goalProposal: { ...createDraft(), after: { ...fields, current_amount: '9999.00' } } }), { code: 'agent_invalid_input' });
    await store.cancelRun(alice, s.conversation.id, r);
  });

  test('expiry is judged by the database clock, stored by the sweep, and old decided proposals are removed', async () => {
    const s = await propose(alice, createDraft());
    await db.query("UPDATE agent_goal_proposals SET expires_at=now()-interval '1 second' WHERE id=$1", [s.goalProposal!.id]);
    assert.equal((await store.getConversation(alice, s.conversation.id)).goalProposal!.status, 'expired');
    const before = await goalCount(alice);
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_expired' });
    await assert.rejects(store.cancelGoalProposal(alice, s.conversation.id, s.goalProposal!.id), { code: 'agent_expired' });

    const old = await propose(alice, createDraft());
    await store.cancelGoalProposal(alice, old.conversation.id, old.goalProposal!.id);
    await db.query("UPDATE agent_goal_proposals SET decided_at=now()-interval '31 days' WHERE id=$1", [old.goalProposal!.id]);
    const recent = await propose(alice, createDraft());
    await store.cleanupAgentData();

    // After the sweep the expired proposal is a stored terminal state, not a gap
    // that would let an older proposal show through.
    const row = (await db.query<{ status: string; decided: boolean }>('SELECT status, decided_at IS NOT NULL AS decided FROM agent_goal_proposals WHERE id=$1', [s.goalProposal!.id])).rows[0]!;
    assert.deepEqual(row, { status: 'expired', decided: true });
    const after = await store.getConversation(alice, s.conversation.id);
    assert.equal(after.goalProposal!.id, s.goalProposal!.id);
    assert.equal(after.goalProposal!.status, 'expired');
    await assert.rejects(store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId: randomUUID() }), { code: 'agent_expired' });
    assert.equal(await goalCount(alice), before);
    assert.equal((await store.getConversation(alice, recent.conversation.id)).goalProposal!.status, 'pending');
    assert.equal((await db.query('SELECT id FROM agent_goal_proposals WHERE id=$1', [old.goalProposal!.id])).rowCount, 0);

    // Thirty days after it was decided, an expired proposal goes too.
    await db.query("UPDATE agent_goal_proposals SET decided_at=now()-interval '31 days' WHERE id=$1", [s.goalProposal!.id]);
    await store.cleanupAgentData();
    assert.equal((await db.query('SELECT id FROM agent_goal_proposals WHERE id=$1', [s.goalProposal!.id])).rowCount, 0);
    assert.equal((await store.getConversation(alice, s.conversation.id)).goalProposal, null);
  });

  test('deleting a conversation removes its proposals but keeps confirmed goals', async () => {
    const s = await propose(alice, createDraft({ name: 'Kept' }));
    const confirmed = await store.confirmGoalProposal(alice, s.conversation.id, { proposalId: s.goalProposal!.id, requestId: randomUUID() });
    const pending = await propose(alice, createDraft({ name: 'Pending' }), s.conversation.id);
    await store.deleteConversation(alice, s.conversation.id);
    assert.equal((await db.query('SELECT id FROM agent_goal_proposals WHERE conversation_id=$1', [s.conversation.id])).rowCount, 0);
    assert.equal((await db.query('SELECT name FROM savings_goals WHERE id=$1', [confirmed.goalProposal!.result_goal_id])).rows[0]!.name, 'Kept');
    assert.ok(pending.goalProposal);
  });
});
