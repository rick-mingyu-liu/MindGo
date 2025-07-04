const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
require('dotenv').config();
const cron = require('node-cron');
const db = require('./db/connection');
const { sendWeeklyReport, generateWeeklyReport } = require('./services/emailService');
const authController = require('./controllers/authController');

const authRoutes = require('./routes/auth');
const transactionRoutes = require('./routes/transactions');
const summaryRoutes = require('./routes/summary');
const goalRoutes = require('./routes/goals');
const investmentRoutes = require('./routes/investments');
const aiRoutes = require('./routes/ai');
const aiController = require('./controllers/aiController');

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(morgan('combined'));
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// API Routes
app.use('/auth', authRoutes);
app.use('/transactions', transactionRoutes);
app.use('/summary', summaryRoutes);
app.use('/goals', goalRoutes);
app.use('/investments', investmentRoutes);
app.use('/ai', aiRoutes);

// Error handling middleware
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ 
    error: 'Something went wrong!',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Route not found' });
});

app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🔗 Health check: http://localhost:${PORT}/health`);
  console.log('🧪 Testable API endpoints:');
  // Auth
  console.log(`  POST   http://localhost:${PORT}/auth/login                (authController.login)`);
  console.log(`  POST   http://localhost:${PORT}/auth/register             (authController.register)`);
  // Transactions
  console.log(`  GET    http://localhost:${PORT}/transactions              (transactionController.getTransactions)`);
  console.log(`  POST   http://localhost:${PORT}/transactions             (transactionController.createTransaction)`);
  console.log(`  GET    http://localhost:${PORT}/transactions/categories  (transactionController.getCategories)`);
  console.log(`  DELETE http://localhost:${PORT}/transactions/clear-all    (transactionController.clearAllTransactions)`);
  console.log(`  DELETE http://localhost:${PORT}/transactions/auto-delete  (transactionController.autoDeleteOldTransactions)`);
  console.log(`  GET    http://localhost:${PORT}/transactions/retention-settings (transactionController.getDataRetentionSettings)`);
  console.log(`  PUT    http://localhost:${PORT}/transactions/retention-settings (transactionController.updateDataRetentionSettings)`);
  console.log(`  PUT    http://localhost:${PORT}/transactions/:id          (transactionController.updateTransaction)`);
  console.log(`  DELETE http://localhost:${PORT}/transactions/:id          (transactionController.deleteTransaction)`);
  // Summary
  console.log(`  GET    http://localhost:${PORT}/summary/monthly           (summaryController.getMonthlySummary)`);
  console.log(`  GET    http://localhost:${PORT}/summary/rolling           (summaryController.getRollingSummary)`);
  console.log(`  GET    http://localhost:${PORT}/summary/trends            (summaryController.getSpendingTrends)`);
  // Goals
  console.log(`  GET    http://localhost:${PORT}/goals                     (goalController.getGoals)`);
  console.log(`  POST   http://localhost:${PORT}/goals                     (goalController.createGoal)`);
  console.log(`  GET    http://localhost:${PORT}/goals/stats               (goalController.getGoalStats)`);
  console.log(`  DELETE http://localhost:${PORT}/goals/clear-all           (goalController.clearAllGoals)`);
  console.log(`  PUT    http://localhost:${PORT}/goals/:id                 (goalController.updateGoal)`);
  console.log(`  DELETE http://localhost:${PORT}/goals/:id                 (goalController.deleteGoal)`);
  console.log(`  PUT    http://localhost:${PORT}/goals/:id/progress        (goalController.updateProgress)`);
  // Investments
  console.log(`  GET    http://localhost:${PORT}/investments/snapshot/:symbol      (investmentController.getStockSnapshot)`);
  console.log(`  GET    http://localhost:${PORT}/investments/watchlist            (investmentController.getWatchlist)`);
  console.log(`  POST   http://localhost:${PORT}/investments/watchlist           (investmentController.addToWatchlist)`);
  console.log(`  DELETE http://localhost:${PORT}/investments/watchlist/clear-all  (investmentController.clearAllWatchlist)`);
  console.log(`  DELETE http://localhost:${PORT}/investments/watchlist/:id        (investmentController.removeFromWatchlist)`);
  console.log(`  GET    http://localhost:${PORT}/investments/historical/:symbol   (investmentController.getHistoricalData)`);
  console.log(`  GET    http://localhost:${PORT}/investments/market-overview      (investmentController.getMarketOverview)`);
  console.log(`  GET    http://localhost:${PORT}/investments/news/:symbol         (investmentController.getStockNews)`);
  console.log(`  GET    http://localhost:${PORT}/investments/financials/:symbol   (investmentController.getStockFinancials)`);
  console.log(`  GET    http://localhost:${PORT}/investments/watchlist/ai-summary (investmentController.getWatchlistAISummary)`);
  console.log(`  GET    http://localhost:${PORT}/investments/search?q=apple       (investmentController.searchStocks)`);
  // AI
  console.log(`  POST   http://localhost:${PORT}/ai/plan                        (aiController.generatePlan)`);
  console.log(`  GET    http://localhost:${PORT}/ai/plans                       (aiController.getPlanHistory)`);
  console.log(`  GET    http://localhost:${PORT}/ai/plans/:id                   (aiController.getPlan)`);
  console.log(`  POST   http://localhost:${PORT}/ai/budget-recommendations      (aiController.generateBudgetRecommendations)`);
  console.log(`  POST   http://localhost:${PORT}/ai/investment-advice           (aiController.generateInvestmentAdvice)`);
});

// Periodically delete AI plans older than 30 minutes (every 5 minutes)
setInterval(() => {
  aiController.autoDeleteOldAIPlans();
}, 5 * 60 * 1000);

// Periodically delete unverified accounts older than 30 minutes (every 10 minutes)
setInterval(() => {
  authController.deleteUnverifiedAccounts();
}, 10 * 60 * 1000);

// Schedule weekly report emails every Sunday at 7pm
cron.schedule('0 19 * * 0', async () => {
  try {
    const users = await db.query(
      'SELECT id, email FROM users WHERE email_notifications_enabled = true AND weekly_reports_enabled = true'
    );
    for (const user of users.rows) {
      const report = await generateWeeklyReport(user.id);
      await sendWeeklyReport(user.email, report.text, report.html);
    }
    console.log('Weekly reports sent!');
  } catch (err) {
    console.error('Error sending weekly reports:', err);
  }
});

module.exports = app; 