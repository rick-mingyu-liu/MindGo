-- Add the notification preference columns the application already expects.
--
-- The settings page has working Email and Weekly-report toggles, authController
-- UPDATEs both columns, and schedulerService selects on them — but the columns
-- were never created. The effect was that saving preferences returned a 500 and
-- the weekly report cron threw on every run, so no weekly email has ever gone
-- out. This adds the missing columns rather than removing the feature, since it
-- is otherwise wired up end to end.
--
-- Both default to true, matching the settings page's own default state.

BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS email_notifications_enabled BOOLEAN NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS weekly_reports_enabled      BOOLEAN NOT NULL DEFAULT true;

COMMIT;
