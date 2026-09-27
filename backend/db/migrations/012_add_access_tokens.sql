-- Personal access tokens for reading your own numbers from another app, such
-- as a personal agent over MCP (POST /mcp). Unlike the login JWT, a token here
-- can only reach /mcp, whose tools read term totals and goals and change
-- nothing. It is shown once when created; only its SHA-256 is stored, so a
-- leaked database does not leak working tokens. Revoking sets revoked_at.
--
-- Apply with:
--   psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f db/migrations/012_add_access_tokens.sql

CREATE TABLE IF NOT EXISTS access_tokens (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    name VARCHAR(60) NOT NULL,
    token_hash CHAR(64) NOT NULL UNIQUE,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    last_used_at TIMESTAMP,
    revoked_at TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_access_tokens_user_id ON access_tokens(user_id);
