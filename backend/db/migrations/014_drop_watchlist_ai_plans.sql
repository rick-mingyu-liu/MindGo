-- Drop the retired stock watchlist and one-shot AI plan storage.
--
-- The stock/watchlist features and one-shot AI Planning were retired earlier
-- (their endpoints answered 410, and Settings could still clear the archived
-- watchlist). The owner decided the archived rows are not needed, so the
-- endpoints, the hourly ai_plans sweep and these tables are removed outright.
-- Nothing else references either table: no foreign key points at them and no
-- view reads them. Their indexes and SERIAL sequences go with the tables, and
-- neither ever had an updated_at trigger.
--
-- Deploy the code that no longer reads these tables FIRST, then apply this.
-- The previous release queries ai_plans in its hourly maintenance job and in
-- GET /ai/plans, and would error against a database without it.
--
-- Idempotent: safe to re-run, and a no-op on a database that never had them.
-- Reports row counts only, never row contents.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/014_drop_watchlist_ai_plans.sql

BEGIN;
-- Fail fast rather than queue behind a query from a release still using the tables.
SET LOCAL lock_timeout = '5s';

DO $$
DECLARE
    tbl TEXT;
    n BIGINT;
BEGIN
    FOREACH tbl IN ARRAY ARRAY['watchlist', 'ai_plans'] LOOP
        IF to_regclass(tbl) IS NULL THEN
            RAISE NOTICE '%: absent, nothing to drop', tbl;
        ELSE
            EXECUTE format('SELECT count(*) FROM %I', tbl) INTO n;
            RAISE NOTICE '%: dropping % row(s)', tbl, n;
        END IF;
    END LOOP;
END $$;

DROP TABLE IF EXISTS watchlist;
DROP TABLE IF EXISTS ai_plans;

COMMIT;
