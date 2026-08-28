const db = require('../db/connection');
const finnhubService = require('../services/finnhubService');
const freeStockDataService = require('../services/freeStockDataService');

const investmentController = {
  // Get stock snapshot
  async getStockSnapshot(req, res) {
    try {
      const { symbol } = req.params;

      if (!symbol) {
        return res.status(400).json({ error: 'Stock symbol is required' });
      }

      // Special handling for major indices
      const indexMap = {
        '^GSPC': { name: 'S&P 500 Index' },
        '^DJI': { name: 'Dow Jones Industrial Average' },
        '^IXIC': { name: 'NASDAQ Composite' },
      };
      if (indexMap[symbol]) {
        // Try Alpha Vantage first
        let quote = null;
        try {
          const avData = await freeStockDataService.getAlphaVantageHistoricalData(symbol);
          // Get the latest date
          const lastIdx = avData.t.length - 1;
          const prevIdx = avData.t.length - 2;
          if (lastIdx >= 0 && prevIdx >= 0) {
            const price = avData.c[lastIdx];
            const prevPrice = avData.c[prevIdx];
            const change = price - prevPrice;
            const changePct = (change / prevPrice) * 100;
            quote = {
              c: price,
              d: change,
              dp: changePct,
              h: avData.h[lastIdx],
              l: avData.l[lastIdx],
              o: avData.o[lastIdx],
              pc: prevPrice,
              t: avData.t[lastIdx],
              v: avData.v[lastIdx],
            };
          }
        } catch (e) {
          // Fallback to Yahoo Finance
          try {
            const yfData = await freeStockDataService.getYahooFinanceHistoricalData(symbol, '5d');
            const lastIdx = yfData.t.length - 1;
            const prevIdx = yfData.t.length - 2;
            if (lastIdx >= 0 && prevIdx >= 0) {
              const price = yfData.c[lastIdx];
              const prevPrice = yfData.c[prevIdx];
              const change = price - prevPrice;
              const changePct = (change / prevPrice) * 100;
              quote = {
                c: price,
                d: change,
                dp: changePct,
                h: yfData.h[lastIdx],
                l: yfData.l[lastIdx],
                o: yfData.o[lastIdx],
                pc: prevPrice,
                t: yfData.t[lastIdx],
                v: yfData.v[lastIdx],
              };
            }
          } catch (err) {
            return res.status(500).json({ error: 'Failed to fetch index data from Alpha Vantage and Yahoo Finance' });
          }
        }
        if (!quote) {
          return res.status(500).json({ error: 'No index data available' });
        }
        return res.json({
          symbol: symbol.toUpperCase(),
          quote,
          companyInfo: {
            name: indexMap[symbol].name,
            ticker: symbol.toUpperCase(),
            // Fill other fields as null or N/A for indices
            country: null,
            industry: null,
            sector: null,
            employees: null,
            website: null,
            description: null,
            logo: null,
            exchange: null,
            ipo: null,
            phone: null,
          },
          tradingInfo: {
            volume: quote.v,
            marketCap: null,
            dayRange: `${quote.l} - ${quote.h}`,
            yearRange: 'N/A',
          }
        });
      }

      // Default: fetch from Finnhub for stocks
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

      // Map period to Yahoo Finance format
      let yahooPeriod = '1mo';
      switch (period) {
        case '1d':
          yahooPeriod = '1d';
          break;
        case '5d':
          yahooPeriod = '5d';
          break;
        case '1m':
          yahooPeriod = '1mo';
          break;
        case '3m':
          yahooPeriod = '3mo';
          break;
        case '6m':
          yahooPeriod = '6mo';
          break;
        case '1y':
          yahooPeriod = '1y';
          break;
        default:
          yahooPeriod = '1mo';
      }

      // Use free data service instead of Finnhub
      const data = await freeStockDataService.getHistoricalData(symbol, yahooPeriod);

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
      const finnhubData = await finnhubService.getFinancials(symbol);
      const annualReports = [];
      const quarterlyReports = [];
  
      if (finnhubData && Array.isArray(finnhubData.data)) {
        for (const report of finnhubData.data) {
          const reportData = report.report || {};
          const bs = reportData.bs || {};
          const ic = reportData.ic || {};
          const cf = reportData.cf || {};
  
          // Log what you're seeing from Finnhub
          // console.log('--- Report for period:', period);
          // console.log('BS:', bs);
          // console.log('IC:', ic);
          // console.log('CF:', cf);
  
          // Helper to find value by concept or label in an array
          function findValue(arr, concepts = [], labels = []) {
            if (!Array.isArray(arr)) return null;
            for (const item of arr) {
              if ((concepts.length && concepts.includes(item.concept)) ||
                  (labels.length && labels.includes(item.label))) {
                return item.value;
              }
            }
            return null;
          }

          // Fallback for period/year
          let reportPeriod = report.period;
          if (!reportPeriod) {
            reportPeriod = report.filedDate || report.endDate || report.startDate || null;
          }
          if (reportPeriod && typeof reportPeriod === 'string') {
            const match = reportPeriod.match(/(\d{4})/);
            reportPeriod = match ? match[1] : reportPeriod;
          }

          // Map all fields robustly
          const revenue = findValue(ic, ['us-gaap_Revenues', 'us-gaap_SalesRevenueNet', 'Revenues', 'Revenue'], ['Revenue', 'Sales Revenue, Net'])
            ?? findValue(cf, ['us-gaap_Revenues', 'us-gaap_SalesRevenueNet', 'Revenues', 'Revenue'], ['Revenue', 'Sales Revenue, Net']);
          const netIncome = findValue(ic, ['us-gaap_NetIncomeLoss', 'NetIncomeLoss', 'NetIncome'], ['Net income', 'Net loss'])
            ?? findValue(cf, ['us-gaap_NetIncomeLoss', 'NetIncomeLoss', 'NetIncome'], ['Net income', 'Net loss']);
          const eps = findValue(ic, [
            'us-gaap_EarningsPerShareBasicAndDiluted',
            'us-gaap_EarningsPerShareBasic',
            'us-gaap_EarningsPerShareDiluted',
            'EarningsPerShareBasic',
            'EarningsPerShareDiluted'
          ], [
            'Net loss per share attributable to common stockholders, basic and diluted (in dollars per share)',
            'Basic net income (loss) per share',
            'Diluted net income (loss) per share'
          ]);
          const assets = findValue(bs, ['us-gaap_Assets', 'Assets'], ['Assets', 'Total current assets']);
          const liabilities = findValue(bs, ['us-gaap_Liabilities', 'Liabilities'], ['Liabilities', 'Total current liabilities']);

          const row = {
            period: reportPeriod,
            revenue,
            netIncome,
            eps,
            assets,
            liabilities,
            form: report.form,
            filedDate: report.filedDate,
            accessNumber: report.accessNumber,
            cik: report.cik,
            filingUrl: (report.cik && report.accessNumber)
              ? `https://www.sec.gov/Archives/edgar/data/${report.cik.replace(/^0+/, '')}/${report.accessNumber.replace(/-/g, '')}/${report.accessNumber}-index.htm`
              : null
          };
  
          if (report.form === '10-K' || report.periodType === 'FY') {
            annualReports.push(row);
          } else if (report.form === '10-Q' || report.periodType === 'QTR') {
            quarterlyReports.push(row);
          }
        }
      } else {
        console.warn('No data returned from Finnhub for:', symbol);
      }
  
      res.json({
        symbol: symbol.toUpperCase(),
        financials: {
          annualReports,
          quarterlyReports
        }
      });
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
  },

  // Get key indicators and recommendation trends for a stock
  async getStockAnalysis(req, res) {
    try {
      const { symbol } = req.params;
      // Fetch recommendation trends
      const recommendations = await finnhubService.getRecommendationTrends(symbol);
      // Fetch EPS surprises (last 4 quarters)
      const epsSurprises = await finnhubService.getEpsSurprises(symbol);
      // Fetch earnings calendar (1 month, US only)
      const earningsCalendar = await finnhubService.getEarningsCalendar(symbol);
      res.json({
        symbol: symbol.toUpperCase(),
        recommendations,
        epsSurprises,
        earningsCalendar
      });
    } catch (error) {
      console.error('Get stock analysis error:', error);
      res.status(500).json({ error: 'Failed to get stock analysis' });
    }
  },
};

module.exports = investmentController; 