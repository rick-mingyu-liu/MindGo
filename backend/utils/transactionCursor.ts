/**
 * The opaque `before` cursor of GET /transactions: base64url of `YYYY-MM-DD|id`,
 * the (date, id) of the last row of the previous page. The list is ordered
 * `date DESC, id DESC`, so "the next page" is every row strictly below that
 * pair -- unlike OFFSET, rows added or deleted between pages cannot make it
 * skip or repeat one. The day stays a string throughout (never a JS Date).
 */

export interface TransactionCursor {
  date: string;
  id: number;
}

export function encodeCursor(date: string, id: number): string {
  return Buffer.from(`${date}|${id}`).toString('base64url');
}

/** The cursor's parts, or null for anything this module did not produce. */
export function decodeCursor(value: unknown): TransactionCursor | null {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,64}$/.test(value)) return null;
  const match = /^(\d{4})-(\d{2})-(\d{2})\|([1-9]\d{0,9})$/.exec(Buffer.from(value, 'base64url').toString('utf8'));
  if (!match) return null;
  const [, y, m, d, id] = match;
  // A real calendar day: Date.UTC rolls 2026-02-31 over to March.
  const probe = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  if (probe.getUTCFullYear() !== Number(y) || probe.getUTCMonth() !== Number(m) - 1 || probe.getUTCDate() !== Number(d)) {
    return null;
  }
  if (Number(id) > 2147483647) return null;
  return { date: `${y}-${m}-${d}`, id: Number(id) };
}
