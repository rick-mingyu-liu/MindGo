import { query } from '../../db/connection';
import type { Draft } from '../../types/import';

/**
 * Marks drafts that match a transaction the user already has — same day, same
 * amount, same currency. A match is a hint, not a verdict: two coffees at the
 * same price on the same day are real. The review screen starts these rows
 * unticked and lets the user decide.
 *
 * Mutates and returns `rows`.
 */

interface ExistingTransaction {
  date: string;
  amount: string;
  currency: string;
}

export async function flagDuplicates(userId: number, rows: Draft[]): Promise<Draft[]> {
  const days = [...new Set(rows.map((row) => row.date).filter((d): d is string => Boolean(d)))];
  if (days.length === 0) return rows;

  // query() is generic, but it cannot infer a row shape from a SQL string, so
  // the shape is named here; this is the shape the SELECT list above actually
  // returns.
  const { rows: existing } = await query(
    'SELECT date, amount, currency FROM transactions WHERE user_id = $1 AND date = ANY($2::date[])',
    [userId, days]
  ) as { rows: ExistingTransaction[] };
  // DATE arrives as 'YYYY-MM-DD' (db/connection.ts) and DECIMAL(10,2) as a
  // two-place string, so both compare exactly with the draft's strings.
  const seen = new Set(existing.map((t) => `${t.date}|${t.amount}|${t.currency}`));
  for (const row of rows) {
    if (row.date && seen.has(`${row.date}|${row.amount}|${row.currency}`)) {
      row.flags.push('possible_duplicate');
    }
  }
  return rows;
}
