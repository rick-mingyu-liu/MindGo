require('dotenv').config();

const config = {
  // Server configuration
  port: process.env.PORT || 3001,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database configuration
  database: {
    url: process.env.DATABASE_URL,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD || '',
    host: process.env.DB_HOST,
    port: process.env.DB_PORT,
    database: process.env.DB_DATABASE,
  },
  
  // JWT configuration
  jwt: {
    secret: process.env.JWT_SECRET,
    expiresIn: '7d',
  },
  
  // CORS configuration
  cors: {
    origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
    credentials: true,
  },
  
  // Email configuration
  email: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  
  // API Keys
  apiKeys: {
    openai: process.env.OPENAI_API_KEY,
    finnhub: process.env.FINNHUB_API_KEY,
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
  },
  
  // Data retention
  dataRetention: {
    defaultTransactionDays: 365,
    defaultAIPlanMinutes: 30,
    defaultUnverifiedAccountMinutes: 30,
  },
  
  // Validation
  validation: {
    passwordMinLength: 8,
    emailMaxLength: 255,
    nameMaxLength: 100,
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'info',
    enableConsoleLogs: process.env.NODE_ENV === 'development',
  },
};

module.exports = config; 