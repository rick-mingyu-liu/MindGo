const db = require('../db/connection');
const { buildDemoData } = require('../db/demoData');
const logger = require('../utils/logger');

/**
 * Writes the demo account.
 *
 * One function serves both callers — `npm run db:seed` and the scheduled
 * refresh — because they must not drift. They differ in exactly one respect,
 * and it is the one that matters:
 *
 *   `create: true`   the seeder. May bring the demo account into existence.
 *   `create: false`  the scheduler. Refreshes an existing demo account and
 *                    creates nothing.
 *
 * ## Why the flag, and not the email address
 *
 * This deletes every transaction, goal and watchlist row belonging to its
 * target before rewriting them. Resolving that target by
 * `email = 'john.doe@example.com'` makes it a guessable string: the address is
 * ordinary, registration does not reserve it, and a scheduled job pointed at
 * it would wipe a real person's data every month with nobody watching. Run by
 * hand the exposure is bounded, because a human is present and would notice.
 * On a timer it is not.
 *
 * So the target is `is_demo = TRUE`, a column registration never sets, and the
 * unique partial index in the schema guarantees there is at most one.
 *
 * Like cleanupService, this **throws** rather than logging and returning: the
 * caller decides what a failed refresh means.
 */

const DEMO_EMAIL = 'john.doe@example.com';
// The credential every surface advertises — the login page, the README and the
// line `db:seed` prints — and the hash it has to verify against. Both are
// exported, and `test/demoAccountService.test.js` pins them to each other with
// a real bcrypt.compare.
//
// That test exists because the pair silently disagreed for the entire life of
// the repo: the hash below was carried over from the first commit's seed.sql
// labelled "bcrypt hash of 'password123'", but it is bcrypt('password'). Every
// documented demo login was rejected and nothing failed loudly enough to say
// so. A comment cannot be wrong about this any more.
const DEMO_PASSWORD = 'password123';
const DEMO_PASSWORD_HASH = '$2a$10$Cz3uqiIWcKlJ1dCUqe2AkuYXGscpq9wwBNMDuTXqtCSbIzyPDMuQ.';

const OWNED_TABLES = ['transactions', 'savings_goals', 'watchlist', 'ai_plans'];

/**
 * `VALUES ($1,$2,$3),($4,$5,$6),...` for `rows.length` rows of `width` columns.
 * One round trip instead of one per row.
 */
function valuesClause(rows, width) {
  return rows
    .map((_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(',')})`)
    .join(',');
}

/**
 * Rewrites the demo account's data as of `now`.
 *
 * @returns {Promise<{status: string, userId?: number, deleted: number, inserted: number}>}
 *   `status` is 'refreshed', 'created', or 'absent' when there is no demo
 *   account and `create` was false.
 */
async function refreshDemoAccount({ create = false, now = new Date() } = {}) {
  const data = buildDemoData(now);

  // A dedicated client, not db.query: the pool hands out a different
  // connection per call, so BEGIN and COMMIT issued through it need not land
  // on the same session and the rewrite would not be atomic at all.
  const client = await db.getPool().connect();

  try {
    await client.query('BEGIN');

    const existing = await client.query(
      'SELECT id FROM users WHERE is_demo = TRUE LIMIT 1'
    );

    let userId = existing.rows[0]?.id;
    let status = 'refreshed';

    if (!userId) {
      if (!create) {
        // Never create from a scheduled run: a job that can conjure its own
        // target cannot be reasoned about from the database's current state.
        await client.query('ROLLBACK');
        return { status: 'absent', deleted: 0, inserted: 0 };
      }
      const created = await client.query(
        `INSERT INTO users (email, password_hash, first_name, last_name, email_verified, is_demo)
         VALUES ($1, $2, 'John', 'Doe', TRUE, TRUE)
         ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                           email_verified = TRUE,
                                           is_demo = TRUE
         RETURNING id`,
        [DEMO_EMAIL, DEMO_PASSWORD_HASH]
      );
      userId = created.rows[0].id;
      status = 'created';
    }

    let deleted = 0;
    for (const table of OWNED_TABLES) {
      const result = await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
      deleted += result.rowCount;
    }

    const txRows = data.transactions.map((t) =>
      [userId, t.amount, t.description, t.category, t.type, t.date, t.currency]);
    await client.query(
      `INSERT INTO transactions (user_id, amount, description, category, type, date, currency)
       VALUES ${valuesClause(txRows, 7)}`,
      txRows.flat()
    );

    const goalRows = data.goals.map((g) =>
      [userId, g.name, g.target_amount, g.current_amount, g.target_date, g.description]);
    await client.query(
      `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, description)
       VALUES ${valuesClause(goalRows, 6)}`,
      goalRows.flat()
    );

    const watchRows = data.watchlist.map((w) => [userId, w.symbol, w.company_name]);
    await client.query(
      `INSERT INTO watchlist (user_id, symbol, company_name)
       VALUES ${valuesClause(watchRows, 3)}`,
      watchRows.flat()
    );

    // No AI plan is written. config.dataRetention.aiPlanMinutes is 30, so the
    // cleanup job deletes one within half an hour — the old seed's plan was
    // gone long before anyone logged in to see it.

    await client.query('COMMIT');

    const inserted = txRows.length + goalRows.length + watchRows.length;
    return { status, userId, deleted, inserted };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/**
 * The scheduled form. Returns the number of rows deleted, which is what
 * `scheduleInterval` logs and audits — and the deletion is the half worth
 * auditing, per decision D. The insert detail goes to the dev channel.
 */
async function refreshDemoAccountOnSchedule(now = new Date()) {
  const result = await refreshDemoAccount({ create: false, now });

  if (result.status === 'absent') {
    // logger.error rather than warn: warn prints nothing in production, and a
    // refresh that quietly does nothing forever is exactly what needs saying
    // out loud. Reached only when the job is enabled but nothing is flagged.
    logger.error(
      'demoRefresh: no user has is_demo = TRUE, so nothing was refreshed. ' +
      'Run `npm run db:seed` once to create the demo account.'
    );
    return 0;
  }

  logger.info(`demoRefresh: wrote ${result.inserted} row(s) for user ${result.userId}`);
  return result.deleted;
}

module.exports = {
  refreshDemoAccount,
  refreshDemoAccountOnSchedule,
  DEMO_EMAIL,
  DEMO_PASSWORD,
  DEMO_PASSWORD_HASH,
  OWNED_TABLES,
};
