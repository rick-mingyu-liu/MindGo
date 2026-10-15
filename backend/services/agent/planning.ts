import { query } from '../../db/connection';
import type { SavingsGoalRow } from '../../types/db';
import { AgentError, type GoalFields, type GoalProposalDraft } from './types';
import { currencies, decimalCents, formatCents, validateDay } from './validation';

/**
 * propose_goal's server side: one savings-goal change, validated here and
 * stored by finishTurn as a pending proposal that only the user's Confirm
 * button applies. Nothing in this module writes a goal. The user id always
 * comes from the route (recordsFor), never from the model.
 */

const MAX_NAME_CHARS = 255;
const MAX_DESCRIPTION_CHARS = 500;
const fieldKeys = ['name', 'target_amount', 'current_amount', 'currency', 'target_date', 'description'];
const inputKeys = ['action', 'goal_id', 'expected_updated_at', ...fieldKeys];

const invalid = (): never => { throw new AgentError('agent_invalid_input'); };

/**
 * savings_goals.updated_at as the version a proposal quotes: fixed-width
 * microsecond text, compared as text and never through a JavaScript Date.
 * (`::text` drops trailing zeros, so two spellings of one instant could differ.)
 */
export const GOAL_VERSION_SQL = "to_char(updated_at, 'YYYY-MM-DD HH24:MI:SS.US')";

// Migration 015 may land after this code. Only a positive answer is cached,
// so applying it later needs no restart; until then proposals are unavailable.
let proposalsTableSeen = false;
/** Whether agent_goal_proposals exists, asked through the caller's connection. */
export async function goalProposalsAvailable(run: (sql: string) => Promise<{ rows: Array<{ present?: boolean }> }> = sql => query<{ present: boolean }>(sql)): Promise<boolean> {
  if (proposalsTableSeen) return true;
  const result = await run("SELECT to_regclass('agent_goal_proposals') IS NOT NULL AS present");
  proposalsTableSeen = result.rows[0]?.present === true;
  return proposalsTableSeen;
}

function object(value: unknown, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const o = value as Record<string, unknown>;
  if (Object.keys(o).some(key => !keys.includes(key))) invalid();
  return o;
}

function nameOf(value: unknown): string {
  if (typeof value !== 'string' || value.includes('\0')) invalid();
  const name = (value as string).trim();
  if (!name || name.length > MAX_NAME_CHARS) invalid();
  return name;
}

/** null and '' both clear a description. */
function descriptionOf(value: unknown): string | null {
  if (value === null) return null;
  if (typeof value !== 'string' || value.length > MAX_DESCRIPTION_CHARS || value.includes('\0')) invalid();
  return (value as string).trim() || null;
}

function goalIdOf(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) invalid();
  return value as number;
}

function versionOf(value: unknown): string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}\.\d{6}$/.test(value)) invalid();
  return value as string;
}

/**
 * The fields a goal will have, normalised: amounts to two decimals, the
 * current amount within [0, target], the currency one of the six. Shared by
 * the tool and by finishTurn, which re-checks anything handed to it.
 */
export function validateGoalFields(value: unknown, unchangedCurrent?: string): GoalFields {
  const o = object(value, fieldKeys);
  if (fieldKeys.some(key => o[key] === undefined)) invalid();
  const target = decimalCents(o.target_amount, { min: 1 });
  const current = decimalCents(o.current_amount);
  // An update may leave an already-exceeded amount alone (a goal saved past its target).
  if (current > target && formatCents(current) !== unchangedCurrent) invalid();
  if (typeof o.currency !== 'string' || !currencies.includes(o.currency)) invalid();
  return {
    name: nameOf(o.name), target_amount: formatCents(target), current_amount: formatCents(current), currency: o.currency as string,
    target_date: o.target_date === null ? null : validateDay(o.target_date), description: descriptionOf(o.description),
  };
}

/** A stored goal as fields. Legacy rows may break today's rules (a past date, a null amount), so this only shapes them. */
function snapshotOf(row: Pick<SavingsGoalRow, 'name' | 'target_amount' | 'current_amount' | 'currency' | 'target_date' | 'description'>): GoalFields {
  const amount = (n: string | null): string => (n !== null && /^-?\d+\.\d{2}$/.test(n) ? n : Number(n ?? 0).toFixed(2));
  return { name: row.name, target_amount: amount(row.target_amount), current_amount: amount(row.current_amount), currency: row.currency, target_date: row.target_date, description: row.description };
}

/** The shape finishTurn stores: re-validated, because anything reaching storage is checked again. */
export function validateGoalDraft(value: unknown): GoalProposalDraft {
  const o = object(value, ['action', 'goal_id', 'expected_updated_at', 'before', 'after']);
  if (o.action === 'create') {
    const after = validateGoalFields(o.after);
    if (o.goal_id !== null || o.expected_updated_at !== null || o.before !== null || after.target_date === null) invalid();
    return { action: 'create', goal_id: null, expected_updated_at: null, before: null, after };
  }
  if (o.action !== 'update') invalid();
  const before = object(o.before, fieldKeys);
  if (typeof before.name !== 'string' || typeof before.target_amount !== 'string' || typeof before.current_amount !== 'string' || typeof before.currency !== 'string'
    || (before.target_date !== null && typeof before.target_date !== 'string') || (before.description !== null && typeof before.description !== 'string')) invalid();
  const checked = validateGoalFields(o.after, before.current_amount as string);
  return { action: 'update', goal_id: goalIdOf(o.goal_id), expected_updated_at: versionOf(o.expected_updated_at), before: before as unknown as GoalFields, after: checked };
}

/**
 * The tool's input to a stored-ready draft. A create needs every required
 * field, including a target date no earlier than today (as the goal form
 * does). An update names a goal by the id and version list_goals returned;
 * omitted optional fields keep their current values, a target date cannot be
 * cleared, and a changed one may not be in the past.
 */
export async function prepareGoalProposal(userId: number, raw: unknown, today: string): Promise<GoalProposalDraft> {
  const input = object(raw, inputKeys);
  const day = validateDay(today);
  if (input.target_date === null) invalid();
  const available = async () => { if (!(await goalProposalsAvailable())) throw new AgentError('agent_unavailable', 503); };
  if (input.action === 'create') {
    if (input.goal_id !== undefined || input.expected_updated_at !== undefined || input.target_date === undefined) invalid();
    const after = validateGoalFields({
      name: input.name, target_amount: input.target_amount, current_amount: input.current_amount ?? '0', currency: input.currency,
      target_date: input.target_date, description: input.description ?? null,
    });
    if (after.target_date! < day) invalid();
    await available();
    return { action: 'create', goal_id: null, expected_updated_at: null, before: null, after };
  }
  if (input.action !== 'update') invalid();
  const goalId = goalIdOf(input.goal_id);
  const expected = versionOf(input.expected_updated_at);
  // Shape-check before reading, so malformed input never reaches the database.
  nameOf(input.name); decimalCents(input.target_amount, { min: 1 });
  if (input.current_amount !== undefined) decimalCents(input.current_amount);
  if (input.target_date !== undefined) validateDay(input.target_date);
  if (input.description !== undefined) descriptionOf(input.description);
  await available();

  const result = await query<Pick<SavingsGoalRow, 'name' | 'target_amount' | 'current_amount' | 'currency' | 'target_date' | 'description'> & { version: string | null }>(
    `SELECT name, target_amount, current_amount, currency, target_date, description, ${GOAL_VERSION_SQL} AS version
     FROM savings_goals WHERE id = $1 AND user_id = $2`,
    [goalId, userId]
  );
  const row = result.rows[0];
  // Another user's goal reads exactly like one that does not exist.
  if (!row) throw new AgentError('agent_goal_not_found', 404);
  if (row.version !== expected) throw new AgentError('agent_goal_conflict', 409);
  const before = snapshotOf(row);
  const after = validateGoalFields({
    name: input.name, target_amount: input.target_amount, currency: input.currency,
    current_amount: input.current_amount ?? before.current_amount,
    target_date: input.target_date === undefined ? before.target_date : input.target_date,
    description: input.description === undefined ? before.description : input.description,
  }, before.current_amount);
  if (after.target_date !== null && after.target_date !== before.target_date && after.target_date < day) invalid();
  if (fieldKeys.every(key => after[key as keyof GoalFields] === before[key as keyof GoalFields])) invalid();
  return { action: 'update', goal_id: goalId, expected_updated_at: expected, before, after };
}
