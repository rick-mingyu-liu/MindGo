import { createHash, randomBytes } from 'node:crypto';
import type { PoolClient } from 'pg';
import { query, getPool } from '../db/connection';
import type { AccessTokenRow } from '../types/db';

/**
 * Personal access tokens: how another app reads your numbers without your
 * password or your login JWT. A token only ever reaches POST /mcp, whose tools
 * read and never write — the login JWT, by contrast, can delete every
 * transaction you have. Only the SHA-256 of a token is stored; the token
 * itself is shown once, when it is created. Migration 012 has the table.
 */

/** Every token starts with this, so one pasted somewhere it shouldn't be is recognisable. */
const PREFIX = 'mgo_';
const TOKEN = /^mgo_[A-Za-z0-9_-]{43}$/;
export const MAX_TOKENS_PER_USER = 5;

export const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export const looksLikeToken = (value: unknown): value is string => typeof value === 'string' && TOKEN.test(value);

/** A token as its owner may see it: everything but the hash and the user id. */
export type TokenSummary = Omit<AccessTokenRow, 'token_hash' | 'user_id'>;

/**
 * Creates a token for a user. Returns the token itself, which is never stored
 * and cannot be shown again, and the row as listTokens would show it.
 */
export async function createToken(userId: number, name: string): Promise<{ id: number; token: string; summary: TokenSummary }> {
  const token = PREFIX + randomBytes(32).toString('base64url');
  // The limit must hold when two requests create at once, which the web UI
  // makes possible. A count inside the INSERT does not: at READ COMMITTED both
  // statements can see four active tokens and both insert. So the user's row is
  // locked first and the count runs in a later statement, whose snapshot is
  // taken after the lock is granted and therefore sees the other's insert.
  // NO KEY UPDATE rather than UPDATE, so the lock does not block the KEY SHARE
  // locks that every foreign-key insert for this user (a transaction, a goal)
  // takes on the same row.
  //
  // A dedicated client, because BEGIN and COMMIT through db.query could land
  // on different pooled connections.
  const client: PoolClient = await getPool().connect();
  try {
    await client.query('BEGIN');
    await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [userId]);
    const active = await client.query<{ n: number }>(
      'SELECT COUNT(*)::int AS n FROM access_tokens WHERE user_id = $1 AND revoked_at IS NULL',
      [userId]
    );
    if ((active.rows[0]?.n ?? 0) >= MAX_TOKENS_PER_USER) {
      throw new RangeError(`at most ${MAX_TOKENS_PER_USER} active tokens; revoke one first`);
    }
    const created = await client.query<TokenSummary>(
      `INSERT INTO access_tokens (user_id, name, token_hash) VALUES ($1, $2, $3)
       RETURNING id, name, created_at, last_used_at, revoked_at`,
      [userId, name.slice(0, 60), hashToken(token)]
    );
    await client.query('COMMIT');
    const summary = created.rows[0];
    if (summary === undefined) throw new Error('INSERT returned no row');
    return { id: summary.id, token, summary };
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

/** The user a token belongs to, or null when it is unknown or revoked. Marks it used. */
export async function userForToken(token: string): Promise<number | null> {
  if (!looksLikeToken(token)) return null;
  const found = await query<Pick<AccessTokenRow, 'id' | 'user_id'>>(
    `UPDATE access_tokens SET last_used_at = CURRENT_TIMESTAMP
     WHERE token_hash = $1 AND revoked_at IS NULL
     RETURNING id, user_id`,
    [hashToken(token)]
  );
  return found.rows[0]?.user_id ?? null;
}

/** A user's tokens, newest first, without their hashes. */
export async function listTokens(userId: number): Promise<TokenSummary[]> {
  const rows = await query<TokenSummary>(
    `SELECT id, name, created_at, last_used_at, revoked_at FROM access_tokens
     WHERE user_id = $1 ORDER BY created_at DESC, id DESC`,
    [userId]
  );
  return rows.rows;
}

/** Revokes one of a user's tokens. Resolves to whether it was active. */
export async function revokeToken(userId: number, id: number): Promise<boolean> {
  const result = await query(
    'UPDATE access_tokens SET revoked_at = CURRENT_TIMESTAMP WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL',
    [id, userId]
  );
  return (result.rowCount ?? 0) > 0;
}
