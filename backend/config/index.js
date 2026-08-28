require('dotenv').config();

/**
 * Every environment variable this backend reads is declared in this file, and
 * only in this file.
 *
 * That one rule is what makes the rest possible: config/validate.js can fail the
 * boot loudly when something required is missing, and `.env.example` can be a
 * complete list rather than a hopeful one. A `process.env` read from a
 * controller or service re-opens both holes — the variable becomes invisible to
 * the startup check and undiscoverable to anyone setting the project up — so
 * add it here and import `config` instead.
 *
 * Values that are policy rather than environment (timeouts, limits, cron
 * expressions) live here too, so that changing one is a single edit rather than
 * a search for duplicated literals.
 */
const config = {
  // Server
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',

  // Database. `url` wins when set; the discrete parts are the fallback for
  // local setups that don't use a connection string. Consumed by
  // db/connection.js, which owns the pool itself.
  database: {
    url: process.env.DATABASE_URL,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    // Queries name tables unqualified, so search_path has to include this.
    // See the comment in db/connection.js for why it is set per connection.
    schema: process.env.DB_SCHEMA || 'public',
  },

  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d',
  },

  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },

  // Where to point users for links inside outgoing email.
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3000',

  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    finnhub: process.env.FINNHUB_API_KEY,
    finnhubToken: process.env.FINNHUB_TOKEN,
    // 'demo' is Alpha Vantage's public sandbox key: it answers, but only for a
    // couple of hardcoded symbols. Fine as a fallback, useless as a config.
    alphaVantage: process.env.ALPHA_VANTAGE_API_KEY || 'demo',
    mailboxLayer: process.env.MAILBOXLAYER_API_KEY,
  },

  // Cron jobs
  cron: {
    weeklyReports: '0 19 * * 0', // Every Sunday at 7pm
    aiPlanCleanup: 5 * 60 * 1000, // 5 minutes
    unverifiedAccountCleanup: 10 * 60 * 1000, // 10 minutes
  },

  // Email verification
  emailVerification: {
    tokenExpiry: 30 * 60 * 1000, // 30 minutes
    // Don't re-send a verification mail if one was issued this recently.
    resendCooldown: 60 * 60 * 1000, // 1 hour
  },

  // How long deleted-by-schedule rows are allowed to live. These are minutes
  // because they are interpolated into a Postgres INTERVAL.
  dataRetention: {
    aiPlanMinutes: 30,
    unverifiedAccountMinutes: 30,
  },

  validation: {
    // Raised from the 6 that routes/auth.js used to enforce. This only gates
    // registration — login checks the hash, and there is no password-change
    // endpoint — so existing shorter passwords keep working.
    passwordMinLength: 8,
    // RFC 5321 caps an address at 254 characters. The users.email column is
    // VARCHAR(255), so this is the tighter of the two limits.
    emailMaxLength: 254,
    // Matches users.first_name / users.last_name, VARCHAR(100). Enforcing it in
    // validation turns a 500 from Postgres into a 400 with a usable message.
    nameMaxLength: 100,
  },

  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsoleLogs: process.env.NODE_ENV === 'development',
  },
};

module.exports = config;
