import { config as loadEnv } from 'dotenv';

loadEnv();

/** Reads a number in (0, 1] from the environment, falling back when unset or out of range. */
function fractionFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseFloat(process.env[name] ?? '');
  return Number.isFinite(parsed) && parsed > 0 && parsed <= 1 ? parsed : fallback;
}

/** Reads a positive integer from the environment, falling back when unset or unparseable. */
function intFromEnv(name: string, fallback: number): number {
  const parsed = Number.parseInt(process.env[name] ?? '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/**
 * Every environment variable this backend reads is declared in this file, and
 * only in this file.
 *
 * That one rule is what makes the rest possible: config/validate.ts can fail the
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
  // db/connection.ts, which owns the pool itself.
  database: {
    url: process.env.DATABASE_URL,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
    // Queries name tables unqualified, so search_path has to include this.
    // See the comment in db/connection.ts for why it is set per connection.
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
    mailboxLayer: process.env.MAILBOXLAYER_API_KEY,
  },

  // Deliberate opt-in; only the confirmation endpoint may write transactions.
  agent: {
    enabled: process.env.AGENT_ENABLED === 'true',
    apiKey: process.env.DEEPSEEK_API_KEY,
    model: process.env.DEEPSEEK_MODEL || 'deepseek-flash',
    timeoutMs: 90_000,
    maxTurns: 10,
    maxToolCalls: 8,
    maxConcurrentRuns: 4,
    maxTurnsPerHour: 20,
    maxInputChars: 4000,
    maxOutputChars: 8000,
    maxOutputTokens: 4000,
    maxHistoryChars: 24_000,
    maxHistoryMessages: 30,
    maxRows: 12,
    maxConversations: 100,
    maxMessagesPerConversation: 200,
    maxTotalTokens: 32_000,
    maxToolOutputChars: 16_000,
  },

  // Rate limiting. Defaults are unchanged from when these were hardcoded in
  // middleware/rateLimiter.ts; they are here so they can be tuned per
  // environment. `apiMax` in particular is worth watching: the dashboard fires
  // roughly five requests per load, so 100 per 15 minutes is about twenty page
  // loads, and everyone behind one NAT shares the bucket.
  rateLimit: {
    windowMs: 15 * 60 * 1000,
    apiMax: intFromEnv('RATE_LIMIT_API_MAX', 100),
    // Covers /register, /login, /resend-verification and /test-email together,
    // per IP — so five is five across all of them, not five each.
    authMax: intFromEnv('RATE_LIMIT_AUTH_MAX', 5),
    // Per user, not per IP: each screenshot parse queries the user's
    // transactions and may reach the LLM fallback.
    importMax: intFromEnv('RATE_LIMIT_IMPORT_MAX', 30),
    // Per user: creating and revoking MCP access tokens together. Each create
    // mints a credential, and a person managing a handful needs few.
    accessTokenMax: intFromEnv('RATE_LIMIT_ACCESS_TOKEN_MAX', 20),
  },

  // Screenshot import. The OCR itself runs in the browser; these bound what
  // the browser may send and what the server does with it.
  import: {
    // Rows whose weakest field is below this are flagged for the user to check.
    confidenceThreshold: fractionFromEnv('IMPORT_CONFIDENCE_THRESHOLD', 0.8),
    // One screenshot's OCR output. The app-wide JSON limit is 100 kB, which a
    // long statement screenshot can pass.
    bodyLimit: '1mb',
    maxLines: 2000,
    maxLineLength: 500,
    // Rows accepted by one POST /transactions/import.
    maxRows: 100,
  },

  // Cron jobs
  cron: {
    weeklyReports: '0 19 * * 0', // Every Sunday at 7pm, in `timezone`
    // Settings promises 7 p.m.; the host's clock is UTC, so say whose 7 p.m.
    timezone: 'America/Toronto',
    // One hourly sweep runs both retention deletions. They used to run every
    // 5 and 10 minutes, which touched the database often enough that Neon,
    // which suspends after about 5 idle minutes, almost never could. Deletion
    // is housekeeping only: expiry is enforced where the rows are read (AI
    // plans) or used (verification tokens), so a later sweep never lets an
    // expired row back in.
    maintenance: 60 * 60 * 1000, // 1 hour
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

  // How long rows live before the hourly maintenance sweep may delete them.
  // An AI plan's lifetime is enforced at read time, so physical deletion only
  // lags it (by up to one sweep while the process runs, longer if it was down
  // or asleep). An unverified account becomes deletable once it is older than
  // unverifiedAccountMinutes *and* its verification link has expired, or once
  // it is older than unverifiedAccountMaxMinutes whatever its link says; at
  // that point registering the same address again replaces it on the spot,
  // without waiting for the sweep. These are minutes because they are
  // interpolated into a Postgres INTERVAL.
  dataRetention: {
    aiPlanMinutes: 30,
    unverifiedAccountMinutes: 30,
    // A hard cap: without it, re-sending the link every half hour (resend is
    // unauthenticated and takes only an address) would keep someone else's
    // unverified registration of an address alive forever.
    unverifiedAccountMaxMinutes: 24 * 60,
  },

  validation: {
    // Raised from the 6 that routes/auth.ts used to enforce. This only gates
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

export = config;
