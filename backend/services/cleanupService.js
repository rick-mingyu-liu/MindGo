const db = require('../db/connection');
const config = require('../config');

/**
 * Scheduled deletions, owned by the service layer.
 *
 * These used to live on `aiController` and `authController`, and
 * `schedulerService` reached *up* into the controller layer to call them. That
 * inversion is the reason this file exists: a service must not depend on the
 * layer above it. Despite what CLAUDE.md and IMPROVEMENTS.md both claimed, no
 * HTTP route ever mounted them — the scheduler was the only caller, so the move
 * is a move, not a split.
 *
 * Each function **throws** on a database error rather than logging and
 * returning. Deciding what a failure means is the caller's job: the scheduler
 * wants to log it and stay alive, whereas a future admin endpoint would want to
 * return a 500. Swallowing it here would take that choice away from both, and
 * it is what let the old scheduler report "cleanup completed" for a cleanup
 * that had just failed.
 *
 * Each returns the number of rows deleted, so the caller has something worth
 * logging. Note that they deliberately do not `RETURNING` the deleted rows:
 * the previous version logged every deleted account's email address, which put
 * user email addresses into the server logs on a 10-minute timer.
 */

/** Deletes AI plans past `config.dataRetention.aiPlanMinutes`. Returns the row count. */
async function deleteOldAIPlans() {
  const result = await db.query(
    'DELETE FROM ai_plans WHERE created_at < NOW() - make_interval(mins => $1)',
    [config.dataRetention.aiPlanMinutes]
  );
  return result.rowCount;
}

/** Deletes never-verified accounts past `config.dataRetention.unverifiedAccountMinutes`. Returns the row count. */
async function deleteUnverifiedAccounts() {
  const result = await db.query(
    'DELETE FROM users WHERE email_verified = FALSE AND created_at < NOW() - make_interval(mins => $1)',
    [config.dataRetention.unverifiedAccountMinutes]
  );
  return result.rowCount;
}

module.exports = { deleteOldAIPlans, deleteUnverifiedAccounts };
