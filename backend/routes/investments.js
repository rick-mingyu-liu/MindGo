const express = require('express');
const { body } = require('express-validator');
const investmentController = require('../controllers/investmentController');
const auth = require('../middleware/auth');
const db = require('../db/connection');
const { getCryptoInfo, getMultipleCryptoInfo } = require('../services/cryptoService');

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

// Get user's crypto watchlist with live info
router.get('/crypto-watchlist', async (req, res) => {
  try {
    const userId = req.user.userId;
    const result = await db.query('SELECT symbol, coin_name FROM crypto_watchlist WHERE user_id = $1', [userId]);
    const symbols = result.rows.map(row => row.symbol);
    const liveData = symbols.length > 0 ? await getMultipleCryptoInfo(symbols) : [];
    // Merge DB info and live data
    const merged = result.rows.map(row => {
      const live = liveData.find(l => l.symbol === row.symbol);
      return {
        symbol: row.symbol,
        coin_name: row.coin_name,
        ...live
      };
    });
    res.json(merged);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch crypto watchlist' });
  }
});

// Add a coin to the user's crypto watchlist
router.post('/crypto-watchlist', async (req, res) => {
  try {
    const userId = req.user.userId;
    const { symbol, coin_name } = req.body;
    await db.query(
      'INSERT INTO crypto_watchlist (user_id, symbol, coin_name) VALUES ($1, $2, $3) ON CONFLICT (user_id, symbol) DO NOTHING',
      [userId, symbol, coin_name]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add coin to watchlist' });
  }
});

// Remove a coin from the user's crypto watchlist
router.delete('/crypto-watchlist/:symbol', async (req, res) => {
  try {
    const userId = req.user.userId;
    const symbol = req.params.symbol;
    await db.query('DELETE FROM crypto_watchlist WHERE user_id = $1 AND symbol = $2', [userId, symbol]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove coin from watchlist' });
  }
});

module.exports = router; 