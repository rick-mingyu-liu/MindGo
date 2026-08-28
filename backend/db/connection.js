const { Pool } = require('pg');
const config = require('../config');

const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes
let pool = null;
let inactivityTimer = null;

// Pin the schema explicitly. Every query in this codebase names tables
// unqualified, which only resolves if search_path includes public. Neon's
// *Azure* pooler handed out sessions with an EMPTY search_path, where those
// queries all failed with 'relation "transactions" does not exist'; the AWS
// pooler this project now runs on hands out a normal "$user", public. So this
// is defensive rather than load-bearing today — it costs one statement per
// connection and makes the app behave identically on any endpoint.
const SEARCH_PATH = config.database.schema;

const baseOptions = {
  ssl: config.nodeEnv === 'production' ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30000, // 30 seconds
};

const connectionOptions = config.database.url
  ? {
      ...baseOptions,
      connectionString: config.database.url,
    }
  : {
      ...baseOptions,
      user: config.database.user,
      password: config.database.password,
      host: config.database.host,
      port: config.database.port,
      database: config.database.database,
    };

function createPool() {
  const newPool = new Pool(connectionOptions);
  newPool.on('connect', (client) => {
    // Queued before the client is handed out, so it runs ahead of any real
    // query on this connection. It cannot go in the pool's `options` instead:
    // Neon's pooler rejects search_path as a startup parameter.
    client.query(`SET search_path TO ${SEARCH_PATH}`).catch((err) => {
      console.error('❌ Failed to set search_path', err);
    });
    console.log('✅ Connected to PostgreSQL database');
  });
  newPool.on('error', (err) => {
    console.error('❌ Unexpected error on idle client', err);
    process.exit(-1);
  });
  return newPool;
}

function getPool() {
  if (!pool) {
    pool = createPool();
  }
  // Reset inactivity timer
  if (inactivityTimer) clearTimeout(inactivityTimer);
  inactivityTimer = setTimeout(() => {
    if (pool) {
      console.log('⌛ No DB activity for 5 minutes. Closing pool and disconnecting from database.');
      pool.end();
      pool = null;
      console.log('🛑 DB pool closed due to inactivity');
    }
  }, INACTIVITY_LIMIT);
  // Housekeeping only: it must not be the reason the process stays alive. A
  // script or test that finishes its queries should exit immediately, not hang
  // for the remaining five minutes.
  inactivityTimer.unref();
  return pool;
}

async function query(text, params) {
  const activePool = getPool();
  return activePool.query(text, params);
}

module.exports = {
  query,
  getPool
}; 