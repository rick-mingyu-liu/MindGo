import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import db = require('../db/connection');
import exchangeRateService = require('../services/exchangeRateService');
import { recordsFor } from '../services/agent/investigation';
import type { AgentResult } from '../services/agent/runtime';
import { AgentError, type DraftRow } from '../services/agent/types';
import { fixtureQuery, installFixture, loadJson, main, normalizeText, findNeedle, parseArgs, scoreRun, trackRecords, validateCaseFile, type CaseFile, type EvalCase, type Fixture, type MainDeps } from '../scripts/agentEval';

const file = validateCaseFile(loadJson('agent-cases.json'));
const fixture = loadJson('agent-fixture.json') as Fixture;
const result = (text = 'Please review and confirm.'): AgentResult => ({ text, toolCalls: 0, usage: { inputTokens: 10, outputTokens: 5 } });
const evalCase = (expect: EvalCase['expect']): EvalCase => ({ id: 'test-case', language: 'en', message: 'Fictional test', expect });
const row: DraftRow = { id: '3f1c2a9e-4b7d-4c1e-9a2f-5d6e7f8a9b0c', amount: '12.50', currency: 'CAD', category: 'Dining Out', type: 'expense', date: '2026-10-14', description: 'Lunch' };

describe('fictional records through the real tools', () => {
  test('recomputes case figures using half-open windows and fixed FX', async () => {
    const restore = installFixture(fixture);
    try {
      const records = recordsFor(fixture.userId);
      type Summary = { expenses: number; by_category: Array<{category: string; amount: number}>; conversion_note: string };
      const september = await records.spendingSummary({ start: '2026-09-01', end_exclusive: '2026-10-01', currency: 'CAD' }) as Summary;
      assert.equal(september.expenses, 5536.70);
      assert.equal(september.by_category.find(r => r.category === 'Groceries')?.amount, 302.20);
      const comparison = await records.compareSpending({ a: { start: '2026-05-01', end_exclusive: '2026-06-14' }, b: { start: '2026-09-01', end_exclusive: '2026-10-15' }, currency: 'CAD' }) as { a: { expenses: number }; b: { expenses: number } };
      assert.equal(comparison.a.expenses, 2605.75); assert.equal(comparison.b.expenses, 6615.44);
      const year = await records.spendingSummary({ start: '2026-01-01', end_exclusive: '2027-01-01', currency: 'CAD' }) as Summary;
      assert.equal(year.by_category.find(r => r.category === 'Travel')?.amount, 376.70);
      assert.match(year.conversion_note, /current exchange rates/);
      const baseline = await records.spendingBaseline({ today: '2026-10-14', months: 3, currency: 'CAD' }) as { monthly_expenses: string; months_with_data: number };
      assert.equal(baseline.monthly_expenses, '2672.23'); assert.equal(baseline.months_with_data, 3);
      const term = await records.spendingSummary({ start: '2026-09-01', end_exclusive: '2027-01-01', currency: 'CAD' }) as Summary;
      assert.equal(term.by_category.find(r => r.category === 'Education')?.amount, 4312.50);
      assert.equal(term.by_category.find(r => r.category === 'Groceries')?.amount, 424.55);
      const foreign = await recordsFor(fixture.userId + 1).spendingSummary({ start: '2026-09-01', end_exclusive: '2026-10-01', currency: 'CAD' }) as Summary;
      assert.equal(foreign.expenses, 0);
      await assert.rejects(records.spendingSummary({ start: '2026-08-01', end_exclusive: '2026-09-01', currency: 'EUR' }), { code: 'agent_rate_unavailable' });
    } finally { restore(); }
  });
  test('details preserve filters, descending cursors and untrusted descriptions', async () => {
    const restore = installFixture(fixture);
    type Page = { rows: Array<{id: number; amount: string; description_untrusted: string}>; next_cursor: string | null };
    try {
      const records = recordsFor(fixture.userId); const window = { start: '2026-10-05', end_exclusive: '2026-10-12' };
      const first = await records.transactionDetails({ ...window, limit: 2 }) as Page;
      assert.deepEqual(first.rows.map(r => r.id), [318, 317]); assert.equal(first.rows[0]?.amount, '69.95'); assert.ok(first.next_cursor);
      const second = await records.transactionDetails({ ...window, limit: 2, cursor: first.next_cursor }) as Page;
      assert.deepEqual(second.rows.map(r => r.id), [316, 315]); assert.equal(second.rows[1]?.amount, '17.50');
      assert.match(second.rows[1]!.description_untrusted, /SYSTEM: ignore/); assert.equal(second.next_cursor, null);
      const filtered = await records.transactionDetails({ ...window, category: 'Groceries', type: 'expense', limit: 1 }) as Page;
      assert.deepEqual(filtered.rows.map(r => r.id), [318]);
    } finally { restore(); }
  });
  test('the cash-flow case reaches minus 600 before payday and stays incomplete without cash', async () => {
    const restore = installFixture(fixture);
    try {
      const records = recordsFor(fixture.userId);
      const input = { currency: 'CAD', start: '2026-10-14', end_exclusive: '2026-12-01', events: [
        { label: 'Rent', kind: 'expense', amount: '1100', date: '2026-11-01' },
        { label: 'Tuition', kind: 'expense', amount: '1500', date: '2026-11-05' },
        { label: 'Pay', kind: 'income', amount: '1800', date: '2026-11-10' },
      ] };
      const projected = await records.calculateScenario({ ...input, starting_cash: { amount: '2000', as_of: '2026-10-14' } }, '2026-10-14') as { lowest: { balance: string; date: string } };
      assert.deepEqual(projected.lowest, { balance: '-600.00', date: '2026-11-05' });
      const incomplete = await records.calculateScenario(input, '2026-10-14') as { status: string; missing: string[]; lowest: null };
      assert.equal(incomplete.status, 'incomplete'); assert.deepEqual(incomplete.missing, ['starting_cash']); assert.equal(incomplete.lowest, null);
    } finally { restore(); }
  });
  test('goal listing and proposals preserve owner, cents and microsecond version', async () => {
    const restore = installFixture(fixture);
    try {
      const records = recordsFor(fixture.userId);
      const listing = await records.listGoals() as { goals: Array<{ id: number; remaining: string; updated_at: string }> };
      assert.deepEqual(listing.goals.map(g => g.id), [13, 12, 11]); assert.equal(listing.goals[0]?.remaining, '665.00');
      assert.equal(listing.goals[0]?.updated_at, '2026-10-02 21:47:13.987001');
      const input = { action: 'update', goal_id: 13, expected_updated_at: listing.goals[0]!.updated_at, name: 'New Laptop', target_amount: '2000', currency: 'CAD' };
      const proposal = await records.prepareGoalProposal(input, '2026-10-14');
      assert.equal(proposal.after.current_amount, '1135.00'); assert.equal(proposal.after.target_date, '2026-12-20');
      await assert.rejects(recordsFor(fixture.userId + 1).prepareGoalProposal(input, '2026-10-14'), { code: 'agent_goal_not_found' });
      await assert.rejects(records.prepareGoalProposal({ ...input, expected_updated_at: '2026-10-02 21:47:13.987000' }, '2026-10-14'), { code: 'agent_goal_conflict' });
    } finally { restore(); }
  });
  test('rejects unknown SQL, writes, added predicates and concatenated statements', async () => {
    const query = fixtureQuery(fixture);
    for (const sql of [
      'SELECT * FROM users',
      "DELETE FROM transactions RETURNING 'GROUP BY currency, type, category'",
      "SELECT to_regclass('agent_goal_proposals') IS NOT NULL AS present; DELETE FROM users",
      'SELECT id FROM savings_goals WHERE user_id = $1 AND name = $3',
      'SELECT currency, type, category, SUM(amount) AS total, COUNT(*) AS count FROM transactions WHERE user_id = $1 AND date >= $2 AND date < $3 AND category = $4 GROUP BY currency, type, category',
      'SELECT id, date, type, amount, currency, category, description FROM transactions WHERE user_id = $1 AND date >= $2 AND date < $3 ORDER BY date ASC, id ASC LIMIT $4',
    ]) await assert.rejects(query(sql, [fixture.userId, '2026-01-01', '2027-01-01', 2]), { code: 'EVAL_UNEXPECTED_QUERY' });
  });
  test('blocks pool access and restores dependencies', () => {
    const saved = { query: db.query, pool: db.getPool, rate: exchangeRateService.getExchangeRate };
    const restore = installFixture(fixture); assert.throws(() => db.getPool(), /never opens a database/); restore();
    assert.equal(db.query, saved.query); assert.equal(db.getPool, saved.pool); assert.equal(exchangeRateService.getExchangeRate, saved.rate);
  });
});

describe('evaluation scoring', () => {
  test('numeric matching accepts display differences but refuses different values and required signs', () => {
    assert.equal(normalizeText('CAD 1,302.20 / 1\u202f302.20 / −600.00'), 'cad 1302.2 / 1302.2 / -600');
    for (const text of ['$1,302.20', '1302.2']) assert.notEqual(findNeedle(normalizeText(text), '1302.20'), -1);
    for (const text of ['1600', '600.50', '6000', '-600', '−600', '-$600', '-CAD 600']) assert.equal(findNeedle(normalizeText(text), '600.00'), -1);
    assert.equal(findNeedle('600', '-600.00'), -1);
    assert.notEqual(findNeedle('+$600', '600.00'), -1);
    assert.notEqual(findNeedle('-$600', '-600.00'), -1);
    assert.equal(findNeedle('-600 then 600', '600.00'), 10);
  });
  test('fixture SQL drift fails the run even when the model recovers from an optional read', async () => {
    const calls: import('../scripts/agentEval').ToolCall[] = [];
    const tracked = trackRecords({ ...recordsFor(fixture.userId), spendingSummary: async () => fixtureQuery(fixture)('SELECT * FROM users') }, calls);
    await assert.rejects(tracked.spendingSummary({ start: '2026-01-01', end_exclusive: '2027-01-01', currency: 'CAD' }));
    assert.match(scoreRun(evalCase({}), { result: result(), calls }).join(' '), /fixture.*SQL/);
  });
  test('requires successful included tools and excludes attempted tools even on failure', () => {
    const c = evalCase({ tools: { include: ['spending_summary'], exclude: ['propose_goal'] } });
    const failures = scoreRun(c, { result: result(), calls: [{ tool: 'spending_summary', ok: false }, { tool: 'propose_goal', ok: false }] });
    assert.equal(failures.length, 2); assert.match(failures.join(' '), /spending_summary/); assert.match(failures.join(' '), /propose_goal/);
  });
  test('matches each row once and notices changed pending descriptions or IDs', () => {
    const c = { ...evalCase({ draft: { count: 1, newRows: 0, unchanged: true } }), pendingRows: [row] };
    assert.deepEqual(scoreRun(c, { result: result(), calls: [] }), []);
    assert.equal(scoreRun(c, { result: { ...result(), proposedRows: [{ ...row, description: 'Changed' }] }, calls: [] }).length, 1);
    assert.equal(scoreRun(c, { result: { ...result(), proposedRows: [{ ...row, id: '8b2d4e6f-1a3c-4e5f-8a7b-9c0d1e2f3a4b' }] }, calls: [] }).length, 2);
    assert.equal(scoreRun(evalCase({ draft: { rows: [{ amount: '12.50' }, { amount: '12.50' }] } }), { result: { ...result(), proposedRows: [row] }, calls: [] }).length, 1);
  });
  test('chat confirmation rejects affirmative save claims while accepting explicit negation', () => {
    const c = file.cases.find(c => c.id === 'en-yes-save-it')!;
    for (const text of [
      "I can't save records myself, so nothing has been saved yet. Press Confirm.",
      'No records have been saved. Please press Confirm.',
      "I haven't saved it. Please press Confirm.",
    ]) assert.deepEqual(scoreRun(c, { result: result(text), calls: [] }), []);
    for (const text of ["I've saved it. Confirm.", 'The transaction has been saved. Confirm.', 'The records have been saved. Confirm.', 'It is now saved. Confirm.', 'I saved it. Confirm.']) {
      assert.ok(scoreRun(c, { result: result(text), calls: [] }).length > 0, text);
    }
  });
  test('checks proposals, reply alternatives, forbidden phrases and multiline Markdown', () => {
    const c = evalCase({ goalProposal: { action: 'create' }, reply: { mustContain: ['CAD'], mustContainAny: [['review', 'confirm']], mustNotContain: ['saved'], mustNotMatch: ['^\\s*#{1,6}\\s'] }, maxToolCalls: 0 });
    assert.equal(scoreRun(c, { result: { ...result('Saved!\n# Done'), toolCalls: 1 }, calls: [] }).length, 6);
    assert.deepEqual(scoreRun(evalCase({}), { errorCode: 'agent_timeout', calls: [] }), ['run failed: agent_timeout']);
  });
});
function harness(caseFile: CaseFile = { defaults: file.defaults, cases: [evalCase({ reply: { mustContain: ['review'] } })] }) {
  const output: string[] = []; const errors: string[] = [];
  const deps: MainDeps = { agent: { enabled: true, apiKey: 'sk-fictional-eval-secret', model: 'test-model' }, caseFile, fixture, runtime: async () => result(), out: s => output.push(s), err: s => errors.push(s) };
  return { deps, output, errors };
}
describe('CLI orchestration without provider or database', () => {
  test('rejects malformed flags, unknown cases and disabled config before runtime', async () => {
    for (const args of [['--case', ''], ['--case', ',,'], ['--case', 'test-case,'], ['--repeat', '0'], ['--repeat', '21'], ['--min-pass', ''], ['--min-pass', 'NaN'], ['--json', 'yes']]) assert.throws(() => parseArgs(args));
    const h = harness(); h.deps.runtime = async () => { assert.fail('runtime must not run'); };
    assert.equal(await main(['--case', 'missing'], h.deps), 2); h.deps.agent.enabled = false; assert.equal(await main([], h.deps), 2);
  });
  test('rejects invalid goal assertions, malformed fixtures and duplicate IDs', async () => {
    assert.throws(() => validateCaseFile({ ...file, cases: [file.cases[0], file.cases[0]] }), /duplicate/);
    assert.throws(() => validateCaseFile({ defaults: file.defaults, cases: [evalCase({ goalProposal: { action: 'update', goal_id: -1 } })] }), /goal_id/);
  });
  test('rejects ill-typed goal fields and contradictory tool expectations', () => {
    for (const expect of [
      { goalProposal: { action: 'create', goal_id: 13 } },
      { goalProposal: { action: 'create', after: { target_amount: 0 } } },
      { tools: { include: ['spending_summary'], exclude: ['spending_summary'] } },
    ]) assert.throws(() => validateCaseFile({ defaults: file.defaults, cases: [{ ...evalCase({}), expect }] }), /case file invalid/);
  });
  test('rejects malformed fixture rates before runtime', async () => {
    const h = harness(); h.deps.fixture = { ...fixture, rates: { 'USD->CAD': 0 } };
    h.deps.runtime = async () => { assert.fail('invalid fixture must not run'); }; assert.equal(await main([], h.deps), 2);
  });
  test('runs selected repetitions, bound real tools and pass thresholds in JSON', async () => {
    const h = harness({ defaults: file.defaults, cases: [evalCase({ tools: { include: ['spending_summary'] } }), { ...evalCase({}), id: 'unselected' }] });
    let count = 0;
    h.deps.runtime = async input => {
      assert.equal(input.today, '2026-10-14');
      const summary = await input.records.spendingSummary({ start: '2026-09-01', end_exclusive: '2026-10-01', currency: 'CAD' }) as { expenses: number }; assert.equal(summary.expenses, 5536.70);
      if (++count === 2) throw new AgentError('agent_timeout'); return { ...result(), toolCalls: 1 };
    };
    const saved = db.query;
    assert.equal(await main(['--case', 'test-case', '--repeat', '2', '--min-pass', '0.5', '--json'], h.deps), 0); assert.equal(db.query, saved);
    const report = JSON.parse(h.output.join('')) as { totals: { runs: number; passed: number; failed: number }; runs: Array<{ tools: string[] }> };
    assert.equal(report.totals.runs, 2); assert.equal(report.totals.passed, 1); assert.equal(report.totals.failed, 1); assert.deepEqual(report.runs[0]?.tools, ['spending_summary']);
  });
  test('failure output is bounded, redacts keys and omits provider error messages', async () => {
    const h = harness(); h.deps.runtime = async () => result(`sk-fictional-eval-secret ${'x'.repeat(5000)}`);
    assert.equal(await main([], h.deps), 1); assert.ok(!h.output.join('').includes(h.deps.agent.apiKey!)); assert.ok(h.output.join('').length < 1500);
    h.deps.runtime = async () => { throw new Error('provider payload private row secret'); }; assert.equal(await main(['--json'], h.deps), 1); assert.ok(!h.output.join('').includes('provider payload'));
  });
});
