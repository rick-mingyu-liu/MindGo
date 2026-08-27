-- Drop the daily check-in / streak feature.
--
-- Nothing else in the database references these tables: their only foreign keys
-- point outward to users(id), so no dependent rows are affected. The application
-- code that read them (summaryController.checkIn / getCheckinStreak /
-- clearAllStreakData) is removed in the same change.
--
-- Run AFTER the matching application code is deployed, otherwise the dashboard's
-- GET /summary/checkin-streak call will 500 on load.

BEGIN;

DROP TABLE IF EXISTS streak_totals;
DROP TABLE IF EXISTS checkins;

COMMIT;
