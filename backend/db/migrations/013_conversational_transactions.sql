-- Apply with psql -v ON_ERROR_STOP=1. Audit first: report counts only,
-- abort on incompatible legacy values, and never rewrite financial records.
BEGIN;
DO $$
DECLARE incompatible BIGINT;
BEGIN
    SELECT count(*) INTO incompatible FROM transactions
      WHERE source IS NULL OR source NOT IN ('manual','ocr','ocr_llm','agent');
    RAISE NOTICE 'Transaction source compatibility audit: % incompatible rows', incompatible;
    IF incompatible > 0 THEN
        RAISE EXCEPTION 'Source audit failed: % incompatible rows; no rows were rewritten', incompatible;
    END IF;
END $$;
ALTER TABLE transactions DROP CONSTRAINT IF EXISTS transactions_source_check;
ALTER TABLE transactions ADD CONSTRAINT transactions_source_check
    CHECK (source IN ('manual','ocr','ocr_llm','agent'));
-- Conversation records never own saved transactions: deleting history cannot
-- cascade into the ledger. Owner is repeated in every compound relationship.
CREATE TABLE IF NOT EXISTS agent_conversations (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    title VARCHAR(80) NOT NULL DEFAULT 'New conversation',
    draft_version INTEGER NOT NULL DEFAULT 0 CHECK (draft_version >= 0),
    currency VARCHAR(10) NOT NULL CHECK (currency IN ('CAD','USD','EUR','GBP','AUD','CNY')),
    timezone VARCHAR(100) NOT NULL,
    language VARCHAR(10) NOT NULL CHECK (language IN ('auto','en','zh')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE(id,user_id)
);
CREATE TABLE IF NOT EXISTS agent_runs (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id INTEGER NOT NULL,
    request_hash CHAR(64) NOT NULL,
    status VARCHAR(12) NOT NULL CHECK (status IN ('running','complete','failed','cancelled')),
    error_code VARCHAR(60),
    input_tokens INTEGER CHECK (input_tokens >= 0),
    output_tokens INTEGER CHECK (output_tokens >= 0),
    tool_calls INTEGER CHECK (tool_calls BETWEEN 0 AND 8),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    lease_until TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '90 seconds'),
    finished_at TIMESTAMPTZ,
    UNIQUE(id,conversation_id,user_id),
    FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE CASCADE
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_runs_one_active ON agent_runs(user_id) WHERE status='running';
CREATE INDEX IF NOT EXISTS idx_agent_runs_admission ON agent_runs(user_id,created_at DESC);
CREATE TABLE IF NOT EXISTS agent_messages (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id INTEGER NOT NULL,
    run_id UUID,
    role VARCHAR(12) NOT NULL CHECK (role IN ('user','assistant')),
    content TEXT NOT NULL CHECK (length(content) BETWEEN 1 AND 16000),
    status VARCHAR(12) NOT NULL CHECK (status IN ('complete','failed','cancelled')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE CASCADE,
    FOREIGN KEY(run_id,conversation_id,user_id) REFERENCES agent_runs(id,conversation_id,user_id) ON DELETE SET NULL (run_id),
    UNIQUE(run_id,role)
);
CREATE INDEX IF NOT EXISTS idx_agent_messages_history ON agent_messages(conversation_id,created_at,id);
CREATE TABLE IF NOT EXISTS agent_drafts (
    id UUID PRIMARY KEY,
    conversation_id UUID NOT NULL,
    user_id INTEGER NOT NULL,
    version INTEGER NOT NULL CHECK (version > 0),
    status VARCHAR(12) NOT NULL CHECK (status IN ('pending','confirmed','cancelled','expired')),
    rows JSONB NOT NULL CHECK (jsonb_typeof(rows)='array' AND jsonb_array_length(rows) <= 12 AND octet_length(rows::text) <= 65536),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    expires_at TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '24 hours'),
    UNIQUE(id,conversation_id,user_id),
    UNIQUE(conversation_id,version),
    FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS agent_receipts (
    id UUID PRIMARY KEY,
    conversation_id UUID,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    request_id UUID NOT NULL,
    request_hash CHAR(64) NOT NULL,
    transaction_ids INTEGER[] NOT NULL CHECK (cardinality(transaction_ids) BETWEEN 1 AND 12),
    -- Exact PostgreSQL timestamp text and tuple version; no financial content.
    transaction_versions JSONB NOT NULL CHECK (octet_length(transaction_versions::text) <= 16384),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    undo_until TIMESTAMPTZ NOT NULL DEFAULT (now()+interval '10 minutes'),
    undone_at TIMESTAMPTZ,
    UNIQUE(user_id,request_id),
    FOREIGN KEY(conversation_id,user_id) REFERENCES agent_conversations(id,user_id) ON DELETE SET NULL (conversation_id)
);
CREATE INDEX IF NOT EXISTS idx_agent_receipts_user ON agent_receipts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_conversations_user ON agent_conversations(user_id,updated_at DESC);

-- Independent of history deletion so clearing a chat cannot reset admission.
CREATE TABLE IF NOT EXISTS agent_admissions (
    id UUID PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_agent_admissions_user ON agent_admissions(user_id,created_at DESC);

COMMIT;
