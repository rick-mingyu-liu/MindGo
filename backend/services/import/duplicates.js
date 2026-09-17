const db = require('../../db/connection');

/**
 * Marks drafts that match a transaction the user already has — same day, same
 * amount, same currency. A match is a hint, not a verdict: two coffees at the
 * same price on the same day are real. The review screen starts these rows
 * unticked and lets the user decide.
 *
 * Mutates and returns `rows`.
 */
async function flagDuplicates(userId, rows) {
  const days = [...new Set(rows.map((row) => row.date).filter(Boolean))];
  if (days.length === 0) return rows;

  const { rows: existing } = await db.query(
    'SELECT date, amount, currency FROM transactions WHERE user_id = $1 AND date = ANY($2::date[])',
    [userId, days]
  );
  // DATE arrives as 'YYYY-MM-DD' (db/connection.js) and DECIMAL(10,2) as a
  // two-place string, so both compare exactly with the draft's strings.
  const seen = new Set(existing.map((t) => `${t.date}|${t.amount}|${t.currency}`));
  for (const row of rows) {
    if (row.date && seen.has(`${row.date}|${row.amount}|${row.currency}`)) {
      row.flags.push('possible_duplicate');
    }
  }
  return rows;
}

module.exports = { flagDuplicates };
