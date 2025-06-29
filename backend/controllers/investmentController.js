const db = require('../db/connection');
const moomooService = require('../services/moomooService');

const investmentController = {
  // Get stock snapshot
  async getStockSnapshot(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required' });
      }

      const snapshot = await moomooService.getStockSnapshot(symbol);

      res.json({
        symbol: symbol.toUpperCase(),
        snapshot
      });

    } catch (error) {
      console.error('Get stock snapshot error:', error);
      res.status(500).json({ error: 'Failed to get stock snapshot' });
    }
  },

  // Get user watchlist
  async getWatchlist(req, res) {
    try {
      const watchlist = await db.query(
        'SELECT * FROM watchlist WHERE user_id = $1 ORDER BY added_at DESC',
        [req.user.userId]
      );

      // Get current prices for all watchlist items
      const watchlistWithPrices = await Promise.all(
        watchlist.rows.map(async (item) => {
          try {
            const snapshot = await moomooService.getStockSnapshot(item.symbol);
            return {
              ...item,
              currentPrice: snapshot.price,
              change: snapshot.change,
              changePercent: snapshot.changePercent
            };
          } catch (error) {
            console.error(`Error getting price for ${item.symbol}:`, error);
            return {
              ...item,
              currentPrice: null,
              change: null,
              changePercent: null
            };
          }
        })
      );

      res.json({ watchlist: watchlistWithPrices });

    } catch (error) {
      console.error('Get watchlist error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Add stock to watchlist
  async addToWatchlist(req, res) {
    try {
      const { symbol, company_name } = req.body;

      if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required' });
      }

      // Check if already in watchlist
      const existing = await db.query(
        'SELECT id FROM watchlist WHERE user_id = $1 AND symbol = $2',
        [req.user.userId, symbol.toUpperCase()]
      );

      if (existing.rows.length > 0) {
        return res.status(400).json({ error: 'Stock already in watchlist' });
      }

      const newWatchlistItem = await db.query(
        'INSERT INTO watchlist (user_id, symbol, company_name) VALUES ($1, $2, $3) RETURNING *',
        [req.user.userId, symbol.toUpperCase(), company_name]
      );

      res.status(201).json({
        message: 'Stock added to watchlist successfully',
        item: newWatchlistItem.rows[0]
      });

    } catch (error) {
      console.error('Add to watchlist error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Remove stock from watchlist
  async removeFromWatchlist(req, res) {
    try {
      const { id } = req.params;

      // Check if item belongs to user
      const existing = await db.query(
        'SELECT id FROM watchlist WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existing.rows.length === 0) {
        return res.status(404).json({ error: 'Watchlist item not found' });
      }

      await db.query(
        'DELETE FROM watchlist WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      res.json({ message: 'Stock removed from watchlist successfully' });

    } catch (error) {
      console.error('Remove from watchlist error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get historical data for a stock
  async getHistoricalData(req, res) {
    try {
      const { symbol } = req.params;
      const { period = '1m' } = req.query;

      if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required' });
      }

      const historicalData = await moomooService.getHistoricalData(symbol, period);

      res.json({
        symbol: symbol.toUpperCase(),
        period,
        data: historicalData
      });

    } catch (error) {
      console.error('Get historical data error:', error);
      res.status(500).json({ error: 'Failed to get historical data' });
    }
  },

  // Get market overview
  async getMarketOverview(req, res) {
    try {
      // Get popular stocks for market overview
      const popularStocks = ['AAPL', 'GOOGL', 'MSFT', 'TSLA', 'AMZN', 'META', 'NVDA', 'NFLX'];
      
      const marketData = await Promise.all(
        popularStocks.map(async (symbol) => {
          try {
            const snapshot = await moomooService.getStockSnapshot(symbol);
            return {
              symbol,
              price: snapshot.price,
              change: snapshot.change,
              changePercent: snapshot.changePercent,
              volume: snapshot.volume
            };
          } catch (error) {
            console.error(`Error getting data for ${symbol}:`, error);
            return {
              symbol,
              price: null,
              change: null,
              changePercent: null,
              volume: null
            };
          }
        })
      );

      // Calculate market sentiment (simple implementation)
      const upCount = marketData.filter(stock => stock.changePercent > 0).length;
      const downCount = marketData.filter(stock => stock.changePercent < 0).length;
      const flatCount = marketData.filter(stock => stock.changePercent === 0).length;

      res.json({
        marketData,
        sentiment: {
          bullish: upCount,
          bearish: downCount,
          neutral: flatCount,
          total: marketData.length
        },
        timestamp: new Date().toISOString()
      });

    } catch (error) {
      console.error('Get market overview error:', error);
      res.status(500).json({ error: 'Failed to get market overview' });
    }
  }
};

module.exports = investmentController; 