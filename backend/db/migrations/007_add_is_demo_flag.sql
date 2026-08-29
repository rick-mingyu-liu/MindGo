-- Marks the demo account, so the scheduled refresh has something to identify
-- it by other than its email address.
--
-- The refresh deletes every transaction, goal and watchlist row belonging to
-- the account before rewriting it. Resolving that account by
-- `email = 'john.doe@example.com'` alone makes the target a guessable string:
-- the address is ordinary, nothing stops a real person registering it, and the
-- job would then wipe their data every month on a timer with nobody watching.
-- Run by hand that risk is bounded, because a human is present. On a schedule
-- it is not.
--
-- So the refresh matches on `is_demo = TRUE` and refuses to touch a row
-- without it. Registration never sets this column; only a deliberate seed does.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/007_add_is_demo_flag.sql

ALTER TABLE users ADD COLUMN IF NOT EXISTS is_demo BOOLEAN NOT NULL DEFAULT FALSE;

-- At most one demo account. The refresh resolves its target with a bare
-- `WHERE is_demo = TRUE`, and two matching rows would make which one it
-- rewrites depend on the plan.
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_single_demo ON users (is_demo) WHERE is_demo;
