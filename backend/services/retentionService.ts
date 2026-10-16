import { query } from '../db/connection';
import config = require('../config');
import logger = require('../utils/logger');
import { boundsOf, lastNTerms } from '../utils/terms';

/**
 * Automatic deletion of old transactions (Settings -> Automatic deletion).
 *
 * A user may choose to keep only their last N terms of transactions, the
 * current term included; `users.transaction_retention_terms` (migration 016)
 * holds N, and NULL — every account's default — is off. The hourly maintenance
 * sweep then deletes that user's transactions dated before the first kept
 * term's start.
 *
 * **Term boundaries come from utils/terms.ts and nowhere else.** The cutoff is
 * `boundsOf(lastNTerms(n, now)[0]).start`, the same module and the same `now`
 * semantics the dashboard's term view uses (`currentTerm(new Date())`), so the
 * dashboard and the deletion can never disagree about where a term starts:
 * deletion removes whole terms, never part of one a chart still shows.
 *
 * Only `transactions` rows are deleted. Savings goals, Pocky conversations,
 * import records and access tokens are untouched, and the Settings copy says
 * exactly that.
 *
 * **The demo account is excluded**, in the sweep and at the setting: the demo
 * is shared by every visitor, so one visitor turning this on must not delete
 * the history every other visitor sees (and the demo refresh would rewrite it
 * anyway). `setRetention` refuses to turn it on there, and the sweep's
 * statement re-checks `NOT is_demo` in case a row was flagged afterwards.
 *
 * Like cleanupService, the sweep **throws** on a database error; the scheduler
 * logs it and carries on with the other maintenance steps.
 */

const COLUMN_PROBE =
  "SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = current_schema() " +
  "AND table_name = 'users' AND column_name = 'transaction_retention_terms') AS present";

// Migration 016 may land after this code. Only a positive answer is cached, so
// applying it later needs no restart; until then the feature is unavailable and
// nothing is deleted.
let columnSeen = false;

/** Whether migration 016 has been applied. */
async function retentionAvailable(): Promise<boolean> {
  if (columnSeen) return true;
  const result = await query<{ present: boolean }>(COLUMN_PROBE);
  columnSeen = result.rows[0]?.present === true;
  return columnSeen;
}

/** Test hook: forget a cached positive probe. */
function resetRetentionProbe(): void {
  columnSeen = false;
}

const choices = (): readonly number[] => config.dataRetention.transactionRetentionTermChoices;

/** True for a number of terms Settings offers. */
function isRetentionChoice(value: unknown): value is number {
  return typeof value === 'number' && choices().includes(value);
}

interface RetentionWindow {
  terms: number;
  /** The first kept term, e.g. '2024-fall'. */
  keepFromTerm: string;
  /** Its first day: rows dated strictly before this are deleted. */
  cutoff: string;
}

/** Where keeping `terms` terms draws the line today. Throws a RangeError for a bad count. */
function retentionWindow(terms: number, now: Date = new Date()): RetentionWindow {
  const keepFromTerm = lastNTerms(terms, now)[0];
  if (!keepFromTerm) throw new RangeError(`no terms for ${terms}`);
  return { terms, keepFromTerm, cutoff: boundsOf(keepFromTerm).start };
}

class RetentionUnavailableError extends Error {
  code = 'retention_unavailable';
  constructor() {
    super('Automatic deletion is not available yet');
    this.name = 'RetentionUnavailableError';
  }
}

class RetentionDemoError extends Error {
  code = 'retention_demo';
  constructor() {
    super('Automatic deletion cannot be turned on for the demo account');
    this.name = 'RetentionDemoError';
  }
}

interface RetentionSetting {
  /** False until migration 016 is applied. */
  available: boolean;
  demo: boolean;
  /** Terms kept, or null when off. */
  retentionTerms: number | null;
  choices: readonly number[];
  /** The window today, when on. */
  window: RetentionWindow | null;
}

function settingOf(available: boolean, demo: boolean, stored: number | null, now: Date): RetentionSetting {
  // A stored value Settings does not offer is reported as it is but never
  // acted on (see deleteExpiredTransactions), so no window is shown for it.
  const terms = stored === null ? null : Number(stored);
  return {
    available,
    demo,
    retentionTerms: terms,
    choices: choices(),
    window: terms !== null && isRetentionChoice(terms) ? retentionWindow(terms, now) : null,
  };
}

/** The user's stored setting. Off (and unavailable) without migration 016. */
async function getRetention(userId: number, now: Date = new Date()): Promise<RetentionSetting> {
  if (!(await retentionAvailable())) return settingOf(false, false, null, now);
  const result = await query<{ terms: number | null; is_demo: boolean }>(
    'SELECT transaction_retention_terms AS terms, is_demo FROM users WHERE id = $1',
    [userId]
  );
  const row = result.rows[0];
  return settingOf(true, row?.is_demo === true, row?.terms ?? null, now);
}

/**
 * Stores the user's setting: one of the offered choices, or null for off.
 * Throws RetentionUnavailableError without migration 016 and RetentionDemoError
 * when turning it on for the demo account.
 */
async function setRetention(userId: number, terms: number | null, now: Date = new Date()): Promise<RetentionSetting> {
  if (terms !== null && !isRetentionChoice(terms)) throw new RangeError(`not a retention choice: ${String(terms)}`);
  if (!(await retentionAvailable())) throw new RetentionUnavailableError();
  // Off is always allowed; on is refused for the demo account in the same
  // statement that would store it, so there is no read-then-write gap.
  const result = await query<{ terms: number | null; is_demo: boolean }>(
    `UPDATE users SET transaction_retention_terms = $1
     WHERE id = $2 AND ($1::smallint IS NULL OR NOT is_demo)
     RETURNING transaction_retention_terms AS terms, is_demo`,
    [terms, userId]
  );
  const row = result.rows[0];
  if (!row) {
    if (terms !== null) throw new RetentionDemoError();
    // The user no longer exists; nothing is stored for nobody.
    return settingOf(true, false, null, now);
  }
  return settingOf(true, row.is_demo, row.terms, now);
}

/** How many of the user's transactions keeping `terms` terms would delete today. */
async function previewRetention(userId: number, terms: number, now: Date = new Date()): Promise<RetentionWindow & { count: number }> {
  const window = retentionWindow(terms, now);
  const result = await query<{ count: number }>(
    'SELECT count(*)::int AS count FROM transactions WHERE user_id = $1 AND date < $2',
    [userId, window.cutoff]
  );
  return { ...window, count: result.rows[0]?.count ?? 0 };
}

/**
 * The hourly sweep. Deletes, for every opted-in non-demo user, the transactions
 * dated before their window's cutoff — at most `transactionRetentionBatch` rows
 * per run in total, the rest on the next run. Returns the number deleted, and
 * audits each user's count (user id and count, nothing from any row).
 *
 * Without migration 016 it deletes nothing. With nobody opted in it runs one
 * SELECT on users and no DELETE.
 */
async function deleteExpiredTransactions(now: Date = new Date()): Promise<number> {
  if (!(await retentionAvailable())) return 0;

  const optedIn = await query<{ id: number; terms: number }>(
    'SELECT id, transaction_retention_terms AS terms FROM users WHERE transaction_retention_terms IS NOT NULL AND NOT is_demo'
  );
  const userIds: number[] = [];
  const terms: number[] = [];
  const cutoffs: string[] = [];
  for (const row of optedIn.rows) {
    const n = Number(row.terms);
    // Fail closed on anything Settings does not offer.
    if (!isRetentionChoice(n)) continue;
    userIds.push(row.id);
    terms.push(n);
    cutoffs.push(retentionWindow(n, now).cutoff);
  }
  if (userIds.length === 0) return 0;

  // One set-based statement. The join on users re-checks each user's setting
  // as it stands now, so someone who turned it off (or changed it) since the
  // SELECT above loses nothing to the value read a moment ago.
  const result = await query<{ user_id: number; deleted: number }>(
    `WITH targets AS (
       SELECT * FROM unnest($1::int[], $2::int[], $3::date[]) AS t(user_id, terms, cutoff)
     ), victims AS (
       SELECT tx.id
       FROM transactions tx
       JOIN targets t ON t.user_id = tx.user_id
       JOIN users u ON u.id = t.user_id
         AND u.transaction_retention_terms = t.terms
         AND NOT u.is_demo
       WHERE tx.date < t.cutoff
       ORDER BY tx.user_id, tx.date, tx.id
       LIMIT $4
     ), deleted AS (
       DELETE FROM transactions tx USING victims v WHERE tx.id = v.id RETURNING tx.user_id
     )
     SELECT user_id, count(*)::int AS deleted FROM deleted GROUP BY user_id ORDER BY user_id`,
    [userIds, terms, cutoffs, config.dataRetention.transactionRetentionBatch]
  );

  let total = 0;
  for (const row of result.rows) {
    total += row.deleted;
    logger.audit(`transactionRetention: user ${row.user_id} deleted ${row.deleted} transaction(s)`);
  }
  return total;
}

export {
  retentionAvailable,
  resetRetentionProbe,
  isRetentionChoice,
  retentionWindow,
  getRetention,
  setRetention,
  previewRetention,
  deleteExpiredTransactions,
  RetentionUnavailableError,
  RetentionDemoError,
};
export type { RetentionSetting, RetentionWindow };
