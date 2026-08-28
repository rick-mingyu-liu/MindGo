const config = require('./index');

/**
 * Startup configuration check.
 *
 * Without JWT_SECRET the server boots happily, then every login throws and every
 * authenticated request 401s — a failure you can only diagnose from symptoms,
 * after a user hits it. Without database credentials nothing that touches a
 * table responds. Both are worth a loud exit at boot instead.
 *
 * Kept out of config/index.js and called explicitly from app.js so that scripts
 * importing `config` for a single value (docs generation, migrations) are not
 * killed by an unrelated missing key.
 */

/** Optional variables, and what stops working without each. */
const OPTIONAL = [
  ['OPENAI_API_KEY', 'AI plans and investment advice (/ai) will fail'],
  ['EMAIL_USER', 'no verification or weekly-report email can be sent'],
  ['EMAIL_PASS', 'no verification or weekly-report email can be sent'],
  ['FINNHUB_API_KEY', 'stock quotes fall back to the free Yahoo / Alpha Vantage path'],
  ['MAILBOXLAYER_API_KEY', 'registration fails outright with a 500 — authController throws before it can degrade'],
];

const MIN_SECRET_LENGTH = 32;

function validateConfig() {
  const errors = [];

  if (!config.jwt.secret) {
    errors.push('JWT_SECRET is not set — every login and authenticated request would fail.');
  }

  // Either the connection string, or a complete set of discrete parts.
  if (!config.database.url) {
    const missing = ['DB_USER', 'DB_HOST', 'DB_DATABASE'].filter((key) => !process.env[key]);
    if (missing.length > 0) {
      errors.push(
        'No database configuration — set DATABASE_URL, or all of DB_USER, DB_HOST and ' +
          `DB_DATABASE (missing: ${missing.join(', ')}).`
      );
    }
  }

  if (errors.length > 0) {
    console.error('\n❌ Cannot start: required configuration is missing.\n');
    for (const error of errors) console.error(`   • ${error}`);
    console.error('\n   backend/.env.example lists every variable this app reads.\n');
    process.exit(1);
  }

  // Non-fatal, but worth saying out loud.
  if (config.jwt.secret.length < MIN_SECRET_LENGTH) {
    console.warn(
      `⚠️  JWT_SECRET is only ${config.jwt.secret.length} characters — ` +
        `use at least ${MIN_SECRET_LENGTH} random characters in production.`
    );
  }

  for (const [key, consequence] of OPTIONAL) {
    if (!process.env[key]) console.warn(`⚠️  ${key} is not set — ${consequence}.`);
  }
}

module.exports = validateConfig;
