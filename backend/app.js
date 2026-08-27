const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();

// Import utilities and services
const config = require('./config');
const logger = require('./utils/logger');
const ErrorHandler = require('./utils/errorHandler');
const schedulerService = require('./services/schedulerService');
const { apiLimiter, aiLimiter } = require('./middleware/rateLimiter');

// Import routes
const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const summaryRoutes = require('./routes/summary');
const goalRoutes = require('./routes/goals');
const investmentRoutes = require('./routes/investments');
const aiRoutes = require('./routes/ai');

const app = express();
const PORT = config.port;

// Render terminates TLS at a proxy, so req.ip is that proxy's address unless
// Express is told to read X-Forwarded-For. Without this the rate limiters below
// see every visitor as one client and throttle the whole user base together.
// The value is the number of trusted hops — not `true`, which would let a
// client spoof its own address via the header.
app.set('trust proxy', 1);

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors(config.cors));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'OK', 
    timestamp: new Date().toISOString(),
    environment: config.nodeEnv,
    version: '1.0.0'
  });
});

// General limiter, mounted after /health so platform health checks are never
// throttled. Credential endpoints add a stricter limiter of their own in
// routes/auth.js.
app.use(apiLimiter);

// API Routes
app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/summary', summaryRoutes);
app.use('/goals', goalRoutes);
app.use('/investments', investmentRoutes);
// Every /ai call costs real OpenAI credit, so it gets its own hourly budget.
app.use('/ai', aiLimiter, aiRoutes);

// Error handling middleware
app.use(ErrorHandler.globalErrorHandler);

// 404 handler
app.use('*', ErrorHandler.notFoundHandler);

// Start server
app.listen(PORT, () => {
  logger.info(`🚀 Server running on port ${PORT}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);
  logger.info(`🌍 Environment: ${config.nodeEnv}`);
  
  // Initialize scheduled tasks
  schedulerService.init();
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully...');
  schedulerService.stop();
  process.exit(0);
});

module.exports = app; 