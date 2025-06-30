const db = require('../db/connection');
const finnhubService = require('../services/finnhubService');

const investmentController = {
  // Get stock snapshot
  async getStockSnapshot(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required' });
      }

      // Fetch quote and profile from Finnhub
      const [quote, profile] = await Promise.all([
        finnhubService.getQuote(symbol),
        finnhubService.getProfile(symbol)
      ]);
      // Optionally, fetch from Moomoo as well if you want trading info
      // const moomoo = await moomooService.getStockSnapshot(symbol);

      // Fallback logic for sector
      let sector = profile.gsector;
      if (!sector || sector === 'N/A') {
        sector = profile.finnhubIndustry || profile.exchange || profile.country || 'N/A';
      }
      // Fallbacks for trading info
      let volume = quote.v !== undefined ? quote.v : 'N/A';
      let dayRange = (quote.l !== undefined && quote.h !== undefined) ? `${quote.l} - ${quote.h}` : null;
      if (!dayRange || dayRange === 'N/A' || dayRange === 'null - null') {
        dayRange = quote.c !== undefined ? `${quote.c}` : 'N/A';
      }
      let yearRange = (profile['52WeekLow'] !== undefined && profile['52WeekHigh'] !== undefined) ? `${profile['52WeekLow']} - ${profile['52WeekHigh']}` : null;
      if (!yearRange || yearRange === 'N/A' || yearRange === 'null - null') {
        yearRange = 'N/A';
      }
      res.json({
        symbol: symbol.toUpperCase(),
        quote,
        companyInfo: {
          name: profile.name,
          country: profile.country,
          industry: profile.finnhubIndustry,
          sector: sector,
          employees: profile.employeeTotal,
          website: profile.weburl,
          description: profile.description,
          logo: profile.logo,
          exchange: profile.exchange,
          ipo: profile.ipo,
          phone: profile.phone,
          ticker: profile.ticker
        },
        tradingInfo: {
          volume: volume,
          marketCap: profile.marketCapitalization !== undefined ? profile.marketCapitalization : null,
          dayRange: dayRange,
          yearRange: yearRange
        }
        // tradingInfo: moomoo ? { volume: moomoo.volume, marketCap: moomoo.marketCap } : undefined
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
            const quote = await finnhubService.getQuote(item.symbol);
            return {
              ...item,
              currentPrice: quote.c,
              change: quote.d,
              changePercent: quote.dp
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

      // Map period to Finnhub resolution and time range
      const now = Math.floor(Date.now() / 1000);
      let from;
      let resolution = 'D';
      switch (period) {
        case '1d':
          from = now - 60 * 60 * 24;
          resolution = '5';
          break;
        case '5d':
          from = now - 60 * 60 * 24 * 5;
          resolution = '15';
          break;
        case '1m':
          from = now - 60 * 60 * 24 * 30;
          break;
        case '3m':
          from = now - 60 * 60 * 24 * 90;
          break;
        case '6m':
          from = now - 60 * 60 * 24 * 180;
          break;
        case '1y':
          from = now - 60 * 60 * 24 * 365;
          break;
        default:
          from = now - 60 * 60 * 24 * 30;
      }
      const data = await finnhubService.getHistoricalData(symbol, resolution, from, now);

      res.json({
        symbol: symbol.toUpperCase(),
        period,
        data
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
            const quote = await finnhubService.getQuote(symbol);
            return {
              symbol,
              price: quote.c,
              change: quote.d,
              changePercent: quote.dp,
              volume: quote.v
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
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get news for a stock
  async getStockNews(req, res) {
    try {
      const { symbol } = req.params;
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const to = now.toISOString().split('T')[0];
      const news = await finnhubService.getNews(symbol, from, to);
      res.json({ symbol: symbol.toUpperCase(), news });
    } catch (error) {
      console.error('Get stock news error:', error);
      res.status(500).json({ error: 'Failed to get stock news' });
    }
  },

  // Get financials for a stock
  async getStockFinancials(req, res) {
    try {
      const { symbol } = req.params;
      const financials = await finnhubService.getFinancials(symbol);
      res.json({ symbol: symbol.toUpperCase(), financials });
    } catch (error) {
      console.error('Get stock financials error:', error);
      res.status(500).json({ error: 'Failed to get stock financials' });
    }
  },

  // Get AI summary for watchlist (placeholder, to be implemented)
  async getWatchlistAISummary(req, res) {
    try {
      // Placeholder: fetch all news for watchlist and return a summary string
      const watchlist = await db.query(
        'SELECT symbol FROM watchlist WHERE user_id = $1',
        [req.user.userId]
      );
      const now = new Date();
      const from = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
      const to = now.toISOString().split('T')[0];
      let allNews = [];
      for (const item of watchlist.rows) {
        const news = await finnhubService.getNews(item.symbol, from, to);
        allNews = allNews.concat(news);
      }
      // TODO: Call AI service to summarize allNews
      const summary = 'AI summary of recent news for your watchlist (to be implemented)';
      res.json({ summary, news: allNews });
    } catch (error) {
      console.error('Get watchlist AI summary error:', error);
      res.status(500).json({ error: 'Failed to get AI summary' });
    }
  },

  // Clear all watchlist items for user (for testing)
  async clearAllWatchlist(req, res) {
    try {
      await db.query(
        'DELETE FROM watchlist WHERE user_id = $1',
        [req.user.userId]
      );

      res.json({ message: 'All watchlist items cleared successfully' });

    } catch (error) {
      console.error('Clear watchlist error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Search for stocks/companies by name or symbol
  async searchStocks(req, res) {
    try {
      const { query } = req.query;
      if (!query) {
        return res.status(400).json({ error: 'Query is required' });
      }
      const results = await finnhubService.searchSymbol(query);
      res.json({ results });
    } catch (error) {
      console.error('Search stocks error:', error);
      res.status(500).json({ error: 'Failed to search stocks' });
    }
  }
};

module.exports = investmentController; 