const { Pool } = require('pg');
require('dotenv').config();

const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes
let pool = null;
let lastRequestTime = Date.now();
let inactivityTimer = null;

// Pin the schema explicitly. Every query in this codebase names tables
// unqualified, which only resolves if search_path includes public — and Neon's
// pooled endpoint (-pooler host) hands out sessions with an EMPTY search_path,
// where those queries fail with 'relation "transactions" does not exist'. The
// direct endpoint defaults to "$user", public and works, so the failure looks
// intermittent depending on which host the connection string points at. Setting
// it here makes the app behave the same on both.
const SEARCH_PATH = process.env.DB_SCHEMA || 'public';

const baseOptions = {
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
  idleTimeoutMillis: 30000, // 30 seconds
};

const connectionOptions = process.env.DATABASE_URL
  ? {
      ...baseOptions,
      connectionString: process.env.DATABASE_URL,
    }
  : {
      ...baseOptions,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_DATABASE,
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
  lastRequestTime = Date.now();
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