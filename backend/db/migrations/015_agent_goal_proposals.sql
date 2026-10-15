-- Planning: storage for savings-goal changes Pocky proposes (agent_goal_proposals).
--
-- Requires migration 013 (agent_conversations, agent_runs) and PostgreSQL 15
-- (column-specific ON DELETE SET NULL). Additive only: no existing row is read
-- or rewritten, and savings_goals is untouched.
--
-- Recommended before deploying the planning release. The code tolerates its
-- absence: until it is applied, goal proposals are simply unavailable (the
-- tool and the confirm/cancel buttons answer agent_unavailable) and every other
-- agent feature works. It is noticed without a restart.
--
-- Idempotent: safe to re-run.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/015_agent_goal_proposals.sql

BEGIN;
SET LOCAL lock_timeout = '5s';
DO $$
BEGIN
    IF current_setting('server_version_num')::int < 150000 THEN
        RAISE EXCEPTION 'Goal proposals require PostgreSQL 15 or later (column-specific ON DELETE SET NULL); this server is %', current_setting('server_version');
    END IF;
    IF to_regclass('agent_conversations') IS NULL OR to_regclass('agent_runs') IS NULL THEN
        RAISE EXCEPTION 'Apply migration 013_conversational_transactions.sql first';
    END IF;
END $$;
-- Planning: savings-goal changes Pocky proposes. Only the user's Confirm
-- button applies one; goal_id has no foreign key because the goal may be
-- deleted meanwhile, which confirmation reports as a conflict.
CREATE TABLE IF NOT EXISTS agent_goal_proposals (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id INTEGER NOT NULL,
    run_id UUID,
    action VARCHAR(8) NOT NULL CHECK (action IN ('create','update')),
    goal_id INTEGER,
    -- savings_goals.updated_at as PostgreSQL text when proposed, to the microsecond.
    expected_updated_at TEXT CHECK (length(expected_updated_at) <= 64),
    before JSONB CHECK (before IS NULL OR (jsonb_typeof(before)='object' AND octet_length(before::text) <= 4096)),
    after JSONB NOT NULL CHECK (jsonb_typeof(after)='object' AND octet_length(after::text) <= 4096),
    status VARCHAR(12) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','confirmed','cancelled','superseded','conflict','expired')),
    request_id UUID,
    request_hash CHAR(64),
    result_goal_id INTEGER,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '24 hours'),
    decided_at TIMESTAMPTZ,
    CHECK ((action='create' AND goal_id IS NULL AND expected_updated_at IS NULL AND before IS NULL)
        OR (action='update' AND goal_id IS NOT NULL AND expected_updated_at IS NOT NULL AND before IS NOT NULL)),
    CHECK ((request_id IS NULL) = (request_hash IS NULL)),
    UNIQUE(user_id,request_id),
    FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE CASCADE,
    FOREIGN KEY(run_id,conversation_id,user_id) REFERENCES agent_runs(id,conversation_id,user_id) ON DELETE SET NULL (run_id)
);
-- Converge a table created by an earlier draft of this migration, whose
-- status check lacked 'expired'. A no-op on a table created above.
ALTER TABLE agent_goal_proposals DROP CONSTRAINT IF EXISTS agent_goal_proposals_status_check;
ALTER TABLE agent_goal_proposals ADD CONSTRAINT agent_goal_proposals_status_check
    CHECK (status IN ('pending','confirmed','cancelled','superseded','conflict','expired'));
CREATE INDEX IF NOT EXISTS idx_agent_goal_proposals_conversation ON agent_goal_proposals(user_id,conversation_id,created_at DESC);
COMMIT;
