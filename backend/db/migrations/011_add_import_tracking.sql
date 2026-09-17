-- Screenshot import: where each transaction came from, and how each import
-- went.
--
-- transactions.source
--   'manual'  typed into the form (every row that exists before this migration)
--   'ocr'     imported from a screenshot, read by the rule-based parser
--   'ocr_llm' imported from a screenshot, structured by the LLM fallback
--
-- import_batches holds one row per confirmed import: how many rows, how many
-- the user had to correct, how many the LLM read. Counts only — never text or
-- amounts. It is what makes "how often does the parser need correcting" an
-- answerable question in production, where logger.info prints nothing and
-- logger.audit is reserved for destructive events.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/011_add_import_tracking.sql

ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS source VARCHAR(20) NOT NULL DEFAULT 'manual'
  CHECK (source IN ('manual', 'ocr', 'ocr_llm'));

CREATE TABLE IF NOT EXISTS import_batches (
    id SERIAL PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    row_count INTEGER NOT NULL CHECK (row_count > 0),
    edited_count INTEGER NOT NULL CHECK (edited_count >= 0),
    llm_count INTEGER NOT NULL CHECK (llm_count >= 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_import_batches_user_id ON import_batches(user_id);
