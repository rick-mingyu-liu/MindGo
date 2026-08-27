-- Split the old "Food & Dining" category into "Groceries" and "Dining Out",
-- and make room for the new "Tax Refund" income category.
--
-- "Food & Dining" conflated two very different kinds of spending. At the time of
-- writing the 64 rows carrying it were roughly two thirds grocery runs
-- (~$8,662) and one third restaurant meals (~$1,116), so a blanket rename would
-- have misfiled every meal out as groceries.
--
-- Rows are routed on their description: anything naming a grocer (grocery,
-- groceries, Costco, the common "cosco" misspelling, or T&T) becomes Groceries;
-- everything else becomes Dining Out. That leaves Dining Out as the default,
-- which is the safer direction — the remaining descriptions are dinners,
-- lunches and restaurant names.
--
-- "Tax Refund" needs no backfill; no existing row uses it.
--
-- There is no CHECK constraint or enum on transactions.category, so this is a
-- plain data update with no schema change.

BEGIN;

UPDATE public.transactions
   SET category = 'Groceries'
 WHERE category = 'Food & Dining'
   AND description ~* '(grocer|costco|cosco|tnt)';

UPDATE public.transactions
   SET category = 'Dining Out'
 WHERE category = 'Food & Dining';

-- Must report 0; anything left means a row slipped past both statements.
DO $$
DECLARE leftover integer;
BEGIN
  SELECT count(*) INTO leftover
    FROM public.transactions WHERE category = 'Food & Dining';
  IF leftover <> 0 THEN
    RAISE EXCEPTION 'Migration incomplete: % rows still on Food & Dining', leftover;
  END IF;
END $$;

COMMIT;
