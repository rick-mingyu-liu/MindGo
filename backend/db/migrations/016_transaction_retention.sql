-- Automatic deletion of old transactions: the user's chosen retention window.
--
-- users.transaction_retention_terms is the number of terms of transactions a
-- user keeps, the current term included (Settings -> Automatic deletion). NULL
-- is off, and NULL is what every existing and new row gets: nothing is ever
-- deleted unless the user turned it on. The hourly maintenance sweep deletes
-- that user's transactions dated before the first kept term's start, with the
-- term boundary from utils/terms.ts (services/retentionService.ts).
--
-- Additive only: no existing row is read or rewritten. The CHECK bounds what
-- can be stored (the application offers 3, 6, 9 or 12), so a stray value can
-- never mean "keep only the current term".
--
-- The code tolerates its absence: until it is applied, Settings reports the
-- option unavailable, saving it answers 503 retention_unavailable, and the
-- sweep deletes nothing. It is noticed without a restart.
--
-- Idempotent: safe to re-run (ADD COLUMN IF NOT EXISTS skips the CHECK too).
--
-- Deploy the code first, then apply this with the direct endpoint (no -pooler):
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/016_transaction_retention.sql

BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE users ADD COLUMN IF NOT EXISTS transaction_retention_terms SMALLINT
    CHECK (transaction_retention_terms BETWEEN 3 AND 12);
COMMIT;
