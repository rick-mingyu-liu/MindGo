-- Make the demo account's password actually be the one every surface advertises.
--
-- The hash in users.password_hash for the demo account came from the first
-- commit's seed.sql, where it was labelled "bcrypt hash of 'password123'". It
-- is not. It is the well-known tutorial hash of 'password':
--
--   $2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi
--
-- So `password123` — printed by db:seed, in README.md, in CLAUDE.md, and shown
-- to every visitor on frontend/pages/login.tsx — was rejected with "Invalid
-- credentials", and the demo login had never worked for anyone who followed the
-- instructions. Nothing caught it because a comment is not executable; the
-- guard is now test/demoAccountService.test.js, which bcrypt.compares the
-- exported DEMO_PASSWORD against the exported DEMO_PASSWORD_HASH.
--
-- Why a migration is needed at all, when the constant in
-- services/demoAccountService.js is already fixed: db:seed only writes
-- password_hash on the branch that CREATES the account. Now that migration 007
-- has set is_demo on the existing row, every seed takes the 'refreshed' branch,
-- which rewrites transactions, goals and watchlist rows and deliberately never
-- touches the user row. So no amount of re-seeding will correct an account that
-- already exists — only this will. Fresh databases get the new hash from the
-- service constant and do not need this migration, which is why there is no
-- schema.sql change: schema.sql carries no seed data.
--
-- Targeted by is_demo, never by email, for the same reason migration 007 gave:
-- john.doe@example.com is an ordinary address nothing reserves, and an UPDATE
-- of password_hash matched on a guessable string would overwrite a real
-- person's credential. The unique partial index from 007 guarantees at most one
-- row can match.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/010_fix_demo_password_hash.sql

BEGIN;

UPDATE public.users
   SET password_hash = '$2a$10$Cz3uqiIWcKlJ1dCUqe2AkuYXGscpq9wwBNMDuTXqtCSbIzyPDMuQ.',
       email_verified = TRUE
 WHERE is_demo = TRUE;

-- Exactly one demo account must have been updated. Zero means db:seed has never
-- run against this database (the demo account does not exist yet, and will be
-- created with the corrected hash straight from the service constant); more
-- than one is impossible while idx_users_single_demo exists, so it would mean
-- migration 007 was skipped and this UPDATE just rewrote an unknown number of
-- real users' passwords.
DO $$
DECLARE demo_count integer;
BEGIN
  SELECT count(*) INTO demo_count FROM public.users WHERE is_demo = TRUE;
  IF demo_count > 1 THEN
    RAISE EXCEPTION 'Expected at most 1 demo account, found % — is migration 007 applied?', demo_count;
  END IF;
  IF demo_count = 0 THEN
    RAISE NOTICE 'No demo account on this database; run `npm run db:seed` to create one.';
  END IF;
END $$;

COMMIT;
