const db = require('../db/connection');
const axios = require('axios');

// Get enhanced stock data for a symbol
const getStockData = async (req, res) => {
  try {
    const { symbol } = req.params;
    const userId = req.user.id;

    // Get basic stock data
    const stockQuery = `
      SELECT * FROM stock_data 
      WHERE symbol = $1
    `;
    const stockResult = await db.query(stockQuery, [symbol.toUpperCase()]);
    
    if (stockResult.rows.length === 0) {
      return res.status(404).json({ error: 'Stock not found' });
    }

    const stockData = stockResult.rows[0];

    // Get financial reports
    const reportsQuery = `
      SELECT * FROM financial_reports 
      WHERE symbol = $1 
      ORDER BY release_date DESC 
      LIMIT 10
    `;
    const reportsResult = await db.query(reportsQuery, [symbol.toUpperCase()]);

    // Get recent news
    const newsQuery = `
      SELECT * FROM stock_news 
      WHERE symbol = $1 
      ORDER BY published_at DESC 
      LIMIT 10
    `;
    const newsResult = await db.query(newsQuery, [symbol.toUpperCase()]);

    // Get analyst ratings
    const ratingsQuery = `
      SELECT * FROM analyst_ratings 
      WHERE symbol = $1 
      ORDER BY rating_date DESC 
      LIMIT 20
    `;
    const ratingsResult = await db.query(ratingsQuery, [symbol.toUpperCase()]);

    // Get price history for charts
    const priceHistoryQuery = `
      SELECT * FROM stock_price_history 
      WHERE symbol = $1 
      ORDER BY date DESC 
      LIMIT 30
    `;
    const priceHistoryResult = await db.query(priceHistoryQuery, [symbol.toUpperCase()]);

    // Check if stock is in user's watchlist
    const watchlistQuery = `
      SELECT * FROM watchlist 
      WHERE user_id = $1 AND symbol = $2
    `;
    const watchlistResult = await db.query(watchlistQuery, [userId, symbol.toUpperCase()]);

    // Calculate analyst rating summary
    const ratings = ratingsResult.rows;
    const buyCount = ratings.filter(r => r.rating === 'buy').length;
    const holdCount = ratings.filter(r => r.rating === 'hold').length;
    const sellCount = ratings.filter(r => r.rating === 'sell').length;
    const avgPriceTarget = ratings.length > 0 
      ? ratings.reduce((sum, r) => sum + (r.price_target || 0), 0) / ratings.length 
      : null;

    res.json({
      stock: stockData,
      financialReports: reportsResult.rows,
      news: newsResult.rows,
      analystRatings: ratings,
      priceHistory: priceHistoryResult.rows.reverse(), // Reverse for chronological order
      isWatched: watchlistResult.rows.length > 0,
      analystSummary: {
        total: ratings.length,
        buy: buyCount,
        hold: holdCount,
        sell: sellCount,
        averagePriceTarget: avgPriceTarget
      }
    });

  } catch (error) {
    console.error('Error fetching stock data:', error);
    res.status(500).json({ error: 'Failed to fetch stock data' });
  }
};

// Get user's enhanced watchlist
const getEnhancedWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;

    const query = `
      SELECT w.*, sd.*
      FROM watchlist w
      LEFT JOIN stock_data sd ON w.symbol = sd.symbol
      WHERE w.user_id = $1
      ORDER BY w.added_at DESC
    `;

    const result = await db.query(query, [userId]);
    
    res.json({
      watchlist: result.rows.map(row => ({
        id: row.id,
        symbol: row.symbol,
        companyName: row.company_name,
        currentPrice: row.current_price,
        change: row.change_amount,
        changePercent: row.change_percent,
        marketCap: row.market_cap,
        volume: row.volume,
        sector: row.sector,
        industry: row.industry,
        addedAt: row.added_at,
        lastUpdated: row.last_updated
      }))
    });

  } catch (error) {
    console.error('Error fetching enhanced watchlist:', error);
    res.status(500).json({ error: 'Failed to fetch watchlist' });
  }
};

// Add stock to enhanced watchlist
const addToWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol, companyName } = req.body;

    if (!symbol || !companyName) {
      return res.status(400).json({ error: 'Symbol and company name are required' });
    }

    // Check if already in watchlist
    const existingQuery = `
      SELECT * FROM watchlist 
      WHERE user_id = $1 AND symbol = $2
    `;
    const existingResult = await db.query(existingQuery, [userId, symbol.toUpperCase()]);
    
    if (existingResult.rows.length > 0) {
      return res.status(400).json({ error: 'Stock already in watchlist' });
    }

    // Add to watchlist
    const insertQuery = `
      INSERT INTO watchlist (user_id, symbol, company_name)
      VALUES ($1, $2, $3)
      RETURNING *
    `;
    const result = await db.query(insertQuery, [userId, symbol.toUpperCase(), companyName]);

    // Try to fetch and store stock data if not exists
    await fetchAndStoreStockData(symbol.toUpperCase());

    res.status(201).json({
      message: 'Stock added to watchlist',
      watchlistItem: result.rows[0]
    });

  } catch (error) {
    console.error('Error adding to watchlist:', error);
    res.status(500).json({ error: 'Failed to add stock to watchlist' });
  }
};

// Remove stock from watchlist
const removeFromWatchlist = async (req, res) => {
  try {
    const userId = req.user.id;
    const { symbol } = req.params;

    const query = `
      DELETE FROM watchlist 
      WHERE user_id = $1 AND symbol = $2
    `;
    const result = await db.query(query, [userId, symbol.toUpperCase()]);

    if (result.rowCount === 0) {
      return res.status(404).json({ error: 'Stock not found in watchlist' });
    }

    res.json({ message: 'Stock removed from watchlist' });

  } catch (error) {
    console.error('Error removing from watchlist:', error);
    res.status(500).json({ error: 'Failed to remove stock from watchlist' });
  }
};

// Search stocks
const searchStocks = async (req, res) => {
  try {
    const { q } = req.query;
    
    if (!q || q.length < 2) {
      return res.status(400).json({ error: 'Search query must be at least 2 characters' });
    }

    const query = `
      SELECT symbol, company_name, sector, industry, current_price, change_amount, change_percent
      FROM stock_data 
      WHERE symbol ILIKE $1 OR company_name ILIKE $1
      ORDER BY 
        CASE WHEN symbol ILIKE $1 THEN 1 ELSE 2 END,
        company_name
      LIMIT 20
    `;
    
    const result = await db.query(query, [`%${q}%`]);
    
    res.json({ stocks: result.rows });

  } catch (error) {
    console.error('Error searching stocks:', error);
    res.status(500).json({ error: 'Failed to search stocks' });
  }
};

// Get market overview
const getMarketOverview = async (req, res) => {
  try {
    const userId = req.user.id;

    // Get user's watchlist summary
    const watchlistQuery = `
      SELECT COUNT(*) as total_stocks,
             COUNT(CASE WHEN sd.change_percent > 0 THEN 1 END) as gaining,
             COUNT(CASE WHEN sd.change_percent < 0 THEN 1 END) as declining
      FROM watchlist w
      LEFT JOIN stock_data sd ON w.symbol = sd.symbol
      WHERE w.user_id = $1
    `;
    const watchlistResult = await db.query(watchlistQuery, [userId]);

    // Get top gainers and losers
    const topStocksQuery = `
      SELECT symbol, company_name, current_price, change_amount, change_percent
      FROM stock_data 
      WHERE current_price IS NOT NULL
      ORDER BY ABS(change_percent) DESC
      LIMIT 10
    `;
    const topStocksResult = await db.query(topStocksQuery);

    res.json({
      watchlistSummary: watchlistResult.rows[0],
      topMovers: topStocksResult.rows
    });

  } catch (error) {
    console.error('Error fetching market overview:', error);
    res.status(500).json({ error: 'Failed to fetch market overview' });
  }
};

// Fetch and store stock data from external API
const fetchAndStoreStockData = async (symbol) => {
  try {
    // This would integrate with a real stock API (Alpha Vantage, Yahoo Finance, etc.)
    // For now, we'll use mock data
    const mockData = {
      symbol: symbol,
      company_name: `${symbol} Company`,
      sector: 'Technology',
      industry: 'Software & IT Services',
      employees: 10000,
      website: `https://www.${symbol.toLowerCase()}.com`,
      description: `This is a mock description for ${symbol}`,
      market_cap: 1000000000,
      pe_ratio: 25.5,
      dividend_yield: 1.5,
      beta: 1.2,
      volume: 1000000,
      avg_volume: 1200000,
      day_range: '$100.00 - $105.00',
      year_range: '$80.00 - $120.00',
      current_price: 102.50,
      change_amount: 2.50,
      change_percent: 2.5
    };

    // Upsert stock data
    const upsertQuery = `
      INSERT INTO stock_data (
        symbol, company_name, sector, industry, employees, website, description,
        market_cap, pe_ratio, dividend_yield, beta, volume, avg_volume,
        day_range, year_range, current_price, change_amount, change_percent
      ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)
      ON CONFLICT (symbol) DO UPDATE SET
        current_price = EXCLUDED.current_price,
        change_amount = EXCLUDED.change_amount,
        change_percent = EXCLUDED.change_percent,
        volume = EXCLUDED.volume,
        last_updated = CURRENT_TIMESTAMP
    `;

    await db.query(upsertQuery, [
      mockData.symbol, mockData.company_name, mockData.sector, mockData.industry,
      mockData.employees, mockData.website, mockData.description, mockData.market_cap,
      mockData.pe_ratio, mockData.dividend_yield, mockData.beta, mockData.volume,
      mockData.avg_volume, mockData.day_range, mockData.year_range,
      mockData.current_price, mockData.change_amount, mockData.change_percent
    ]);

  } catch (error) {
    console.error('Error fetching stock data:', error);
  }
};

// Seed sample data for testing
const seedSampleData = async (req, res) => {
  try {
    const sampleStocks = [
      {
        symbol: 'AAPL',
        company_name: 'Apple Inc.',
        sector: 'Technology',
        industry: 'Consumer Electronics',
        employees: 164000,
        website: 'https://www.apple.com',
        description: 'Apple Inc. designs, manufactures, and markets smartphones, personal computers, tablets, wearables, and accessories worldwide.',
        market_cap: 2500000000000,
        pe_ratio: 28.5,
        dividend_yield: 0.65,
        beta: 1.2,
        volume: 45000000,
        avg_volume: 52000000,
        day_range: '$175.50 - $178.20',
        year_range: '$124.17 - $198.23',
        current_price: 175.43,
        change_amount: 2.15,
        change_percent: 1.24
      },
      {
        symbol: 'MSFT',
        company_name: 'Microsoft Corporation',
        sector: 'Technology',
        industry: 'Software & IT Services',
        employees: 221000,
        website: 'https://www.microsoft.com',
        description: 'Microsoft Corporation develops, licenses, and supports software, services, devices, and solutions worldwide.',
        market_cap: 2800000000000,
        pe_ratio: 35.2,
        dividend_yield: 0.85,
        beta: 1.1,
        volume: 22000000,
        avg_volume: 25000000,
        day_range: '$378.00 - $380.50',
        year_range: '$280.00 - $400.00',
        current_price: 378.85,
        change_amount: -1.23,
        change_percent: -0.32
      }
    ];

    for (const stock of sampleStocks) {
      await fetchAndStoreStockData(stock.symbol);
    }

    res.json({ message: 'Sample data seeded successfully' });

  } catch (error) {
    console.error('Error seeding sample data:', error);
    res.status(500).json({ error: 'Failed to seed sample data' });
  }
};

module.exports = {
  getStockData,
  getEnhancedWatchlist,
  addToWatchlist,
  removeFromWatchlist,
  searchStocks,
  getMarketOverview,
  seedSampleData
}; 