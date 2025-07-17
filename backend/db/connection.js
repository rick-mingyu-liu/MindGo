const { Pool } = require('pg');
require('dotenv').config();

const INACTIVITY_LIMIT = 5 * 60 * 1000; // 5 minutes
let pool = null;
let lastRequestTime = Date.now();
let inactivityTimer = null;

const connectionOptions = process.env.DATABASE_URL
  ? {
      connectionString: process.env.DATABASE_URL,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      idleTimeoutMillis: 30000, // 30 seconds
    }
  : {
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD || '',
      host: process.env.DB_HOST,
      port: process.env.DB_PORT,
      database: process.env.DB_DATABASE,
      ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
      idleTimeoutMillis: 30000, // 30 seconds
    };

function createPool() {
  const newPool = new Pool(connectionOptions);
  newPool.on('connect', () => {
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