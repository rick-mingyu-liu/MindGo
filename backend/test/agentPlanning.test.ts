import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import db = require('../db/connection');
import exchangeRateService = require('../services/exchangeRateService');
import { spendingBaseline, listGoals, recordsFor } from '../services/agent/investigation';
import { prepareGoalProposal, validateGoalDraft } from '../services/agent/planning';

/**
 * Pocky's planning reads and goal proposals with `db.query` stubbed: the
 * windows and SQL they use, and every rule a proposal must pass before it can
 * reach storage.
 */

interface Query { text: string; params: unknown[] }
let queries: Query[];
let answer: (text: string, params: unknown[]) => unknown[];
// Whether migration 015's table exists, as the availability probe sees it.
let tablePresent: boolean;
let probes: number;

beforeEach(() => {
  queries = []; answer = () => []; tablePresent = true; probes = 0;
  mock.method(db, 'query', async (text: string, params: unknown[]) => {
    if (text.includes('to_regclass')) { probes++; return { rowCount: 1, rows: [{ present: tablePresent }] }; }
    queries.push({ text, params });
    const rows = answer(text, params);
    return { rowCount: rows.length, rows };
  });
  mock.method(exchangeRateService, 'getExchangeRate', async () => assert.fail('no conversion expected'));
});
afterEach(() => mock.restoreAll());

const today = '2026-10-14';

// First, while nothing has seen the table yet: only a positive probe is cached.
describe('without migration 015', () => {
  test('proposals are unavailable after validation, and the table is re-probed until it appears', async () => {
    tablePresent = false;
    await assert.rejects(prepareGoalProposal(42, { action: 'create', name: 'n', target_amount: '1', currency: 'CAD', target_date: '2027-01-01' }, today), { code: 'agent_unavailable', status: 503 });
    // Invalid input is still invalid input, and costs no probe.
    await assert.rejects(prepareGoalProposal(42, { action: 'create', name: 'n', target_amount: '0', currency: 'CAD', target_date: '2027-01-01' }, today), { code: 'agent_invalid_input' });
    await assert.rejects(prepareGoalProposal(42, { action: 'update', goal_id: 3, expected_updated_at: '2026-10-01 09:15:42.123456', name: 'n', target_amount: '1', currency: 'CAD' }, today), { code: 'agent_unavailable' });
    assert.equal(probes, 2);
    assert.equal(queries.length, 0);
    tablePresent = true;
    await prepareGoalProposal(42, { action: 'create', name: 'n', target_amount: '1', currency: 'CAD', target_date: '2027-01-01' }, today);
    tablePresent = false;
    // Seen once, cached: no further probes.
    await prepareGoalProposal(42, { action: 'create', name: 'n', target_amount: '1', currency: 'CAD', target_date: '2027-01-01' }, today);
    assert.equal(probes, 3);
  });
});
const goalRow = { name: 'Fictional laptop', target_amount: '1500.00', current_amount: '200.00', currency: 'CAD', target_date: '2027-04-30', description: null, version: '2026-10-01 09:15:42.123456' };
const update = (over: Record<string, unknown> = {}) => ({ action: 'update', goal_id: 3, expected_updated_at: goalRow.version, name: 'Fictional laptop', target_amount: '1800', currency: 'CAD', ...over });
const create = (over: Record<string, unknown> = {}) => ({ action: 'create', name: 'Fictional trip', target_amount: '2000', currency: 'CAD', target_date: '2027-05-01', ...over });

describe('spendingBaseline', () => {
  test('the last N whole months before today, averaged over months with data, in cents', async () => {
    answer = (text) => text.includes('GROUP BY')
      ? [{ currency: 'CAD', type: 'income', category: 'Salary', total: '3000.00', count: '2' }, { currency: 'CAD', type: 'expense', category: 'Housing', total: '1800.01', count: '2' }]
      : [{ months: '2' }];
    const out = await spendingBaseline(42, { months: 3, currency: 'CAD', today });
    assert.deepEqual(out.window, { start: '2026-07-01', end_exclusive: '2026-10-01', days: 92 });
    assert.equal(out.months_with_data, 2);
    assert.equal(out.monthly_income, '1500.00');
    // 1800.01 / 2 = 900.005 -> 900.01 (cents rounded half up)
    assert.equal(out.monthly_expenses, '900.01');
    assert.equal(out.monthly_net, '599.99');
    assert.deepEqual(out.by_category, [{ category: 'Salary', type: 'income', monthly_amount: '1500.00' }, { category: 'Housing', type: 'expense', monthly_amount: '900.01' }]);
    assert.match(out.note, /not a bank balance/);
    for (const q of queries) { assert.equal(q.params[0], 42); assert.deepEqual(q.params.slice(1), ['2026-07-01', '2026-10-01']); assert.doesNotMatch(q.text, /description|SELECT \*/); }
  });

  test('defaults to three months, crosses year boundaries, and twelve is the most', async () => {
    assert.deepEqual((await spendingBaseline(1, { currency: 'CAD', today: '2027-01-05' })).window, { start: '2026-10-01', end_exclusive: '2027-01-01', days: 92 });
    assert.deepEqual((await spendingBaseline(1, { months: 12, currency: 'CAD', today: '2027-01-05' })).window.start, '2026-01-01');
    for (const months of [0, 13, 1.5]) await assert.rejects(spendingBaseline(1, { months, currency: 'CAD', today }), { code: 'agent_invalid_input' });
    await assert.rejects(spendingBaseline(1, { currency: 'JPY', today }), { code: 'agent_invalid_input' });
  });

  test('no data gives null averages, not zeros', async () => {
    answer = (text) => (text.includes('GROUP BY') ? [] : [{ months: '0' }]);
    const out = await spendingBaseline(1, { currency: 'CAD', today });
    assert.equal(out.monthly_income, null);
    assert.equal(out.monthly_net, null);
    assert.match(out.note, /no baseline/);
  });
});

describe('listGoals', () => {
  test('named columns only, bound to the user, at most 20, descriptions clipped and cleaned', async () => {
    answer = () => Array.from({ length: 21 }, (_, i) => ({ id: i + 1, name: `Goal ${i}`, target_amount: '100.00', current_amount: i === 0 ? '99.60' : null, currency: 'CAD', target_date: null, description: i === 0 ? `Note‮evil\u0000${'z'.repeat(200)}` : null, version: '2026-10-01 09:15:42.123456' }));
    const out = await listGoals(42);
    assert.equal(queries.length, 1);
    assert.match(queries[0]!.text, /^SELECT id, name, target_amount, current_amount, currency, target_date, description, to_char\(updated_at, 'YYYY-MM-DD HH24:MI:SS\.US'\) AS version\s+FROM savings_goals WHERE user_id = \$1/);
    assert.match(queries[0]!.text, /ORDER BY target_date NULLS LAST, id LIMIT \$2/);
    assert.deepEqual(queries[0]!.params, [42, 21]);
    assert.equal(out.goals.length, 20);
    assert.equal(out.truncated, true);
    const first = out.goals[0]!;
    assert.equal('description' in first, false);
    assert.equal(Array.from(first.description_untrusted!).length, 80);
    assert.ok(first.description_untrusted!.startsWith('Note evil '));
    assert.equal(first.updated_at, '2026-10-01 09:15:42.123456');
    assert.equal(first.remaining, '0.40');
    assert.equal(first.percent, 99);
    assert.equal(out.goals[1]!.current_amount, '0.00');
    assert.equal(out.goals[1]!.description_untrusted, null);
  });

  test('an amount that does not read as cents is an error, never a silent zero', async () => {
    answer = () => [{ id: 1, name: 'Odd', target_amount: 'NaN', current_amount: '0.00', currency: 'CAD', target_date: null, description: null, version: null }];
    await assert.rejects(listGoals(42), (error: unknown) => error instanceof Error && error.message === 'goal_amount_unreadable' && !('code' in error && error.code === 'agent_invalid_input'));
  });
});

describe('prepareGoalProposal: create', () => {
  test('normalises amounts, defaults current to zero and reads nothing', async () => {
    const draft = await prepareGoalProposal(42, create({ description: '  For the summer  ' }), today);
    assert.deepEqual(draft, { action: 'create', goal_id: null, expected_updated_at: null, before: null,
      after: { name: 'Fictional trip', target_amount: '2000.00', current_amount: '0.00', currency: 'CAD', target_date: '2027-05-01', description: 'For the summer' } });
    assert.equal(queries.length, 0);
    assert.equal((await prepareGoalProposal(42, create({ target_date: today }), today)).after.target_date, today);
  });

  test('refuses ids, past dates, bad amounts, currencies, names and extra keys', async () => {
    for (const bad of [
      create({ goal_id: 3 }), create({ expected_updated_at: goalRow.version }), create({ target_date: '2026-10-13' }), create({ target_date: undefined }), create({ target_date: null }), create({ target_date: '2027-02-30' }),
      create({ target_amount: '0' }), create({ target_amount: '100000000' }), create({ target_amount: 2000 }), create({ current_amount: '2000.01' }),
      create({ current_amount: '-1' }), create({ currency: 'JPY' }), create({ name: '   ' }), create({ name: 'x'.repeat(256) }),
      create({ description: 'x'.repeat(501) }), create({ user_id: 9 }), { ...create(), action: 'delete' },
    ]) await assert.rejects(prepareGoalProposal(42, bad, today), { code: 'agent_invalid_input' }, JSON.stringify(bad).slice(0, 80));
    assert.equal(queries.length, 0);
  });
});

describe('prepareGoalProposal: update', () => {
  test('reads the owned goal, keeps omitted optional fields and snapshots before', async () => {
    answer = () => [goalRow];
    const draft = await prepareGoalProposal(42, update(), today);
    assert.match(queries[0]!.text, /FROM savings_goals WHERE id = \$1 AND user_id = \$2/);
    assert.deepEqual(queries[0]!.params, [3, 42]);
    assert.deepEqual(draft, {
      action: 'update', goal_id: 3, expected_updated_at: goalRow.version,
      before: { name: 'Fictional laptop', target_amount: '1500.00', current_amount: '200.00', currency: 'CAD', target_date: '2027-04-30', description: null },
      after: { name: 'Fictional laptop', target_amount: '1800.00', current_amount: '200.00', currency: 'CAD', target_date: '2027-04-30', description: null },
    });
    await assert.rejects(prepareGoalProposal(42, update({ target_date: null }), today), { code: 'agent_invalid_input' });
  });

  test('an amount already past its target may stay there, but cannot be moved further past it', async () => {
    answer = () => [{ ...goalRow, current_amount: '1700.00' }];
    const draft = await prepareGoalProposal(42, update({ target_amount: '1600' }), today);
    assert.equal(draft.after.current_amount, '1700.00');
    assert.equal(validateGoalDraft(draft).after.current_amount, '1700.00');
    await assert.rejects(prepareGoalProposal(42, update({ target_amount: '1600', current_amount: '1750' }), today), { code: 'agent_invalid_input' });
  });

  test("another user's goal is not found; a stale version conflicts", async () => {
    answer = () => [];
    await assert.rejects(prepareGoalProposal(42, update(), today), { code: 'agent_goal_not_found' });
    answer = () => [{ ...goalRow, version: '2026-10-01 09:15:42.123457' }];
    await assert.rejects(prepareGoalProposal(42, update(), today), { code: 'agent_goal_conflict' });
  });

  test('requires id and version, refuses no-op changes and new past dates, but keeps an old past date', async () => {
    for (const bad of [update({ goal_id: undefined }), update({ expected_updated_at: undefined }), update({ goal_id: '3' }), update({ goal_id: 0 }), update({ expected_updated_at: 'yesterday' }), update({ expected_updated_at: '2026-10-01 09:15:42.12345' })]) {
      await assert.rejects(prepareGoalProposal(42, bad, today), { code: 'agent_invalid_input' });
    }
    assert.equal(queries.length, 0);
    answer = () => [goalRow];
    await assert.rejects(prepareGoalProposal(42, update({ target_amount: '1500' }), today), { code: 'agent_invalid_input' });
    await assert.rejects(prepareGoalProposal(42, update({ target_date: '2026-01-01' }), today), { code: 'agent_invalid_input' });
    answer = () => [{ ...goalRow, target_date: '2026-01-01' }];
    assert.equal((await prepareGoalProposal(42, update(), today)).after.target_date, '2026-01-01');
  });

  test('the user id comes from recordsFor, never the input', async () => {
    answer = () => [goalRow];
    await recordsFor(77).prepareGoalProposal(update(), today);
    assert.deepEqual(queries[0]!.params, [3, 77]);
  });
});

describe('validateGoalDraft', () => {
  test('re-checks what finishTurn would store', () => {
    const after = { name: 'n', target_amount: '1.00', current_amount: '0.00', currency: 'CAD', target_date: '2027-01-01', description: null };
    assert.deepEqual(validateGoalDraft({ action: 'create', goal_id: null, expected_updated_at: null, before: null, after }).after, after);
    assert.throws(() => validateGoalDraft({ action: 'create', goal_id: 3, expected_updated_at: null, before: null, after }), { code: 'agent_invalid_input' });
    assert.throws(() => validateGoalDraft({ action: 'update', goal_id: 3, expected_updated_at: goalRow.version, before: null, after }), { code: 'agent_invalid_input' });
    assert.throws(() => validateGoalDraft({ action: 'create', goal_id: null, expected_updated_at: null, before: null, after: { ...after, current_amount: '2.00' } }), { code: 'agent_invalid_input' });
    assert.throws(() => validateGoalDraft({ action: 'create', goal_id: null, expected_updated_at: null, before: null, after: { ...after, extra: 1 } }), { code: 'agent_invalid_input' });
    assert.throws(() => validateGoalDraft({ action: 'create', goal_id: null, expected_updated_at: null, before: null, after: { ...after, target_date: null } }), { code: 'agent_invalid_input' });
  });
});
