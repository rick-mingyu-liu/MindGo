const db = require('./connection');
const { buildDemoData } = require('./demoData');
const { labelOf } = require('../utils/terms');

/**
 * Seeds the demo account, anchored to today.
 *
 * **Re-runnable, and that is the point.** The previous version executed
 * `seed.sql`, which relied on `ON CONFLICT DO NOTHING` to make a second run
 * harmless. It did not: `transactions`, `savings_goals` and `ai_plans` have no
 * unique constraint on their data columns, so there was no conflict to catch
 * and a second `npm run db:seed` simply inserted all 46 transactions again.
 * Only `watchlist` has `UNIQUE(user_id, symbol)` and was actually protected.
 *
 * So this replaces the demo user's rows rather than adding to them, inside one
 * transaction: a failure part-way leaves the account as it was rather than
 * half-rewritten. Running it monthly keeps the demo permanently current.
 *
 * It touches exactly one account — the row whose email is DEMO_EMAIL — and
 * every delete is scoped to that user id. It is not a database reset.
 */

// bcrypt hash of 'password123', unchanged from the original seed.
const DEMO_PASSWORD_HASH = '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi';

/**
 * `VALUES ($1,$2,$3),($4,$5,$6),...` for `rows.length` rows of `width`
 * columns. One round trip instead of one per row, which against a pooled Neon
 * endpoint is the difference between a second and most of a minute.
 */
function valuesClause(rows, width) {
  return rows
    .map((_, r) => `(${Array.from({ length: width }, (_, c) => `$${r * width + c + 1}`).join(',')})`)
    .join(',');
}

async function seedDatabase(now = new Date()) {
  const data = buildDemoData(now);

  // A dedicated client, not db.query: the pool hands out a different
  // connection per call, so BEGIN and COMMIT issued through it could land on
  // different sessions and the rewrite would not be atomic at all.
  const client = await db.getPool().connect();

  try {
    console.log('🌱 Seeding the demo account...');
    await client.query('BEGIN');

    const user = await client.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified)
       VALUES ($1, $2, 'John', 'Doe', true)
       ON CONFLICT (email) DO UPDATE SET password_hash = EXCLUDED.password_hash,
                                         email_verified = true
       RETURNING id`,
      [data.email, DEMO_PASSWORD_HASH]
    );
    const userId = user.rows[0].id;

    // Scoped to the demo user, never a bare DELETE.
    for (const table of ['transactions', 'savings_goals', 'watchlist', 'ai_plans']) {
      await client.query(`DELETE FROM ${table} WHERE user_id = $1`, [userId]);
    }

    const txRows = data.transactions.map((t) =>
      [userId, t.amount, t.description, t.category, t.type, t.date, t.currency]);
    await client.query(
      `INSERT INTO transactions (user_id, amount, description, category, type, date, currency)
       VALUES ${valuesClause(txRows, 7)}`,
      txRows.flat()
    );

    const goalRows = data.goals.map((g) =>
      [userId, g.name, g.target_amount, g.current_amount, g.target_date, g.description]);
    await client.query(
      `INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, description)
       VALUES ${valuesClause(goalRows, 6)}`,
      goalRows.flat()
    );

    const watchRows = data.watchlist.map((w) => [userId, w.symbol, w.company_name]);
    await client.query(
      `INSERT INTO watchlist (user_id, symbol, company_name)
       VALUES ${valuesClause(watchRows, 3)}`,
      watchRows.flat()
    );

    // No AI plan is seeded. config.dataRetention.aiPlanMinutes is 30, so the
    // cleanup job deletes one within half an hour of it being written — the
    // old seed's plan was gone long before anyone logged in to see it.

    await client.query('COMMIT');

    const first = data.transactions[0]?.date;
    const last = data.transactions[data.transactions.length - 1]?.date;
    console.log('✅ Demo account seeded');
    console.log(`   ${data.transactions.length} transactions, ${first} → ${last}`);
    console.log(`   ${data.terms.map(labelOf).join(', ')}`);
    console.log(`   ${data.goals.length} goals, ${data.watchlist.length} watchlist symbols`);
    console.log('\n📋 Demo login:');
    console.log(`   Email: ${data.email}`);
    console.log('   Password: password123');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    console.error('❌ Error seeding database:', error);
    throw error;
  } finally {
    client.release();
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;
