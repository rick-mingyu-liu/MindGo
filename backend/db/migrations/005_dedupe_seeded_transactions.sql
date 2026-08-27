-- Remove duplicate seed rows from the demo account.
--
-- db:seed was run three times against user 1 (john.doe@example.com), leaving 129
-- transactions where there should be 43 — every income and expense figure on the
-- demo dashboard was tripled. Only user 1 is affected; every other account,
-- including the real one, has zero duplicates.
--
-- A duplicate is an exact match on (amount, description, category, type, date,
-- currency). The lowest id in each group survives. currency is part of the key
-- even though it does not change the count here, so the migration cannot merge
-- two genuinely different-currency rows if it is ever re-run elsewhere.

BEGIN;

DELETE FROM public.transactions t
 WHERE t.user_id = 1
   AND t.id > (
     SELECT min(t2.id)
       FROM public.transactions t2
      WHERE t2.user_id     = t.user_id
        AND t2.amount      = t.amount
        AND t2.description = t.description
        AND t2.category    = t.category
        AND t2.type        = t.type
        AND t2.date        = t.date
        AND t2.currency    = t.currency
   );

-- Must report 0 remaining duplicates.
DO $$
DECLARE dupes integer;
BEGIN
  SELECT count(*) - count(DISTINCT (amount, description, category, type, date, currency))
    INTO dupes
    FROM public.transactions WHERE user_id = 1;
  IF dupes <> 0 THEN
    RAISE EXCEPTION 'Dedupe incomplete: % duplicate rows remain', dupes;
  END IF;
END $$;

COMMIT;
