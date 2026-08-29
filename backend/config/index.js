require('dotenv').config();

/** Reads a positive integer from the environment, falling back when unset or unparseable. */
function intFromEnv(name, fallback) {
  const parsed = Number.parseInt(process.env[name], 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

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

  // Rate limiting. Defaults are unchanged from when these were hardcoded in
  // middleware/rateLimiter.js; they are here so they can be tuned per
  // environment. `apiMax` in particular is worth watching: the dashboard fires
  // roughly five requests per load, so 100 per 15 minutes is about twenty page
  // loads, and everyone behind one NAT shares the bucket.
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    apiMax: intFromEnv('RATE_LIMIT_API_MAX', 100),
    // Covers /register, /login, /resend-verification and /test-email together,
    // per IP — so five is five across all of them, not five each.
    authMax: intFromEnv('RATE_LIMIT_AUTH_MAX', 5),
    aiWindowMs: 60 * 60 * 1000,
    aiMax: intFromEnv('RATE_LIMIT_AI_MAX', 20),
  },

  // Cron jobs
  cron: {
    weeklyReports: '0 19 * * 0', // Every Sunday at 7pm
    aiPlanCleanup: 5 * 60 * 1000, // 5 minutes
    unverifiedAccountCleanup: 10 * 60 * 1000, // 10 minutes
    demoRefresh: 30 * 24 * 60 * 60 * 1000, // 30 days
  },

  demo: {
    // Off unless explicitly turned on. The refresh deletes and rewrites every
    // row belonging to the demo account, and a destructive job that mounts
    // itself by default in whatever environment happens to load this config is
    // not something to opt out of — it is something to opt in to. Set
    // DEMO_REFRESH_ENABLED=true only where a demo account is actually wanted.
    refreshEnabled: process.env.DEMO_REFRESH_ENABLED === 'true',
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
