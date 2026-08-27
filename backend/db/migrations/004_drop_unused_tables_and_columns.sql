-- Remove schema objects nothing in the codebase uses.
--
-- crypto_watchlist: zero references anywhere in backend/ or frontend/ — the
--   crypto feature was dropped or never finished. It also never appeared in
--   schema.sql, so a fresh db:setup has never created it; the table only exists
--   on databases old enough to predate that. Its 6 rows are exported to
--   crypto_watchlist_backup.csv before this runs.
--
-- users.net_worth: read in exactly one place (emailService's weekly report) and
--   written in none, so every user reported a balance of $0.00. The report now
--   derives the balance from transactions, which is the actual source of truth.

BEGIN;

DROP TABLE IF EXISTS public.crypto_watchlist;

ALTER TABLE public.users DROP COLUMN IF EXISTS net_worth;

COMMIT;
