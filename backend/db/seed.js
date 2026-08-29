const { refreshDemoAccount, DEMO_EMAIL } = require('../services/demoAccountService');
const { buildDemoData } = require('./demoData');
const { labelOf } = require('../utils/terms');

/**
 * Seeds the demo account, anchored to today.
 *
 * The write itself lives in services/demoAccountService.js, shared with the
 * scheduled refresh so the two cannot drift. This is the manual entry point,
 * and the only one permitted to bring the account into existence — the
 * scheduled form passes `create: false` and refreshes or does nothing.
 *
 * Re-running is safe and is how the demo stays current: it replaces the demo
 * user's rows rather than adding to them. The previous version leaned on
 * `ON CONFLICT DO NOTHING` for that, which caught nothing, because
 * transactions, savings_goals and ai_plans have no unique constraint on their
 * data columns — a second run simply inserted all 46 transactions again.
 */
async function seedDatabase(now = new Date()) {
  try {
    console.log('🌱 Seeding the demo account...');
    const result = await refreshDemoAccount({ create: true, now });
    const data = buildDemoData(now);

    console.log(result.status === 'created' ? '✅ Demo account created' : '✅ Demo account refreshed');
    console.log(`   replaced ${result.deleted} row(s) with ${result.inserted}`);
    console.log(`   ${data.transactions.length} transactions, ${data.transactions[0]?.date} → ${data.transactions.at(-1)?.date}`);
    console.log(`   ${data.terms.map(labelOf).join(', ')}`);
    console.log(`   ${data.goals.length} goals, ${data.watchlist.length} watchlist symbols`);
    console.log('\n📋 Demo login:');
    console.log(`   Email: ${DEMO_EMAIL}`);
    console.log('   Password: password123');
  } catch (error) {
    console.error('❌ Error seeding database:', error);
    throw error;
  }
}

if (require.main === module) {
  seedDatabase()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}

module.exports = seedDatabase;
