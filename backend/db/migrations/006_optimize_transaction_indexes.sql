-- Match the transactions indexes to how the table is actually queried.
--
-- Every read of transactions filters on user_id, and the dominant one
-- (transactionController.getTransactions) then sorts by date DESC, created_at
-- DESC. A composite index in that exact shape serves the filter and the sort in
-- one pass, and also covers the user_id + date-range scans in summaryController
-- and the weekly report.
--
-- Dropped as a result:
--   idx_transactions_user_id — a strict prefix of the new composite, so the
--     planner can never prefer it. Pure write overhead.
--   idx_transactions_type — zero scans since the stats were last reset. The
--     column has two distinct values across the whole table, so it is not
--     selective enough for the planner to ever choose it.
--
-- idx_transactions_date is kept: it is the only index serving queries that do
-- not lead with user_id.

BEGIN;

CREATE INDEX IF NOT EXISTS idx_transactions_user_date
    ON public.transactions (user_id, date DESC, created_at DESC);

DROP INDEX IF EXISTS public.idx_transactions_user_id;
DROP INDEX IF EXISTS public.idx_transactions_type;

COMMIT;
