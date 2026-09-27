import { createHash, randomBytes } from 'node:crypto';
import { query } from '../db/connection';
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

/** Creates a token for a user. Returns the token itself, which is never stored and cannot be shown again. */
export async function createToken(userId: number, name: string): Promise<{ id: number; token: string }> {
  const token = PREFIX + randomBytes(32).toString('base64url');
  // The limit is checked in the insert itself rather than by a separate read
  // first. Only the CLI creates tokens, so nothing races it in practice.
  const created = await query<Pick<AccessTokenRow, 'id'>>(
    `INSERT INTO access_tokens (user_id, name, token_hash)
     SELECT $1, $2, $3
     WHERE (SELECT COUNT(*) FROM access_tokens WHERE user_id = $1 AND revoked_at IS NULL) < $4
     RETURNING id`,
    [userId, name.slice(0, 60), hashToken(token), MAX_TOKENS_PER_USER]
  );
  const id = created.rows[0]?.id;
  if (id === undefined) throw new RangeError(`at most ${MAX_TOKENS_PER_USER} active tokens; revoke one first`);
  return { id, token };
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
export async function listTokens(userId: number): Promise<Array<Omit<AccessTokenRow, 'token_hash' | 'user_id'>>> {
  const rows = await query<Omit<AccessTokenRow, 'token_hash' | 'user_id'>>(
    `SELECT id, name, created_at, last_used_at, revoked_at FROM access_tokens
     WHERE user_id = $1 ORDER BY created_at DESC`,
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
