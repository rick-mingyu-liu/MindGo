const express = require('express');
const { body } = require('express-validator');
const investmentController = require('../controllers/investmentController');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Validation middleware
const watchlistValidation = [
  body('symbol').notEmpty().withMessage('Stock symbol is required'),
  body('company_name').optional().notEmpty().withMessage('Company name cannot be empty if provided')
];

// Routes
router.get('/snapshot/:symbol', investmentController.getStockSnapshot);
router.get('/watchlist', investmentController.getWatchlist);
router.post('/watchlist', watchlistValidation, investmentController.addToWatchlist);
router.delete('/watchlist/clear-all', investmentController.clearAllWatchlist);
router.delete('/watchlist/:id', investmentController.removeFromWatchlist);
router.get('/historical/:symbol', investmentController.getHistoricalData);
router.get('/market-overview', investmentController.getMarketOverview);
router.get('/news/:symbol', investmentController.getStockNews);
router.get('/financials/:symbol', investmentController.getStockFinancials);
router.get('/watchlist/ai-summary', investmentController.getWatchlistAISummary);
router.get('/search', investmentController.searchStocks);
router.get('/analysis/:symbol', investmentController.getStockAnalysis);

module.exports = router; 