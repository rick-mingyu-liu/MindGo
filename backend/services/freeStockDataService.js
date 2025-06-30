const axios = require('axios');

class FreeStockDataService {
  constructor() {
    this.alphaVantageApiKey = process.env.ALPHA_VANTAGE_API_KEY || 'demo';
    this.cache = new Map();
    this.cacheTimeout = 5 * 60 * 1000; // 5 minutes
  }

  // Get historical data from Yahoo Finance (completely free, no API key needed)
  async getYahooFinanceHistoricalData(symbol, period = '1mo') {
    try {
      // Add longer delay to avoid rate limiting
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Yahoo Finance uses a different endpoint structure
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: {
          range: period,
          interval: '1d',
          includePrePost: false,
          events: 'div,split'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json',
          'Accept-Language': 'en-US,en;q=0.9',
          'Cache-Control': 'no-cache',
          'Referer': 'https://finance.yahoo.com/'
        },
        timeout: 15000
      });

      if (response.status === 429) {
        throw new Error('Rate limited by Yahoo Finance. Please try again later.');
      }

      if (response.status !== 200) {
        throw new Error(`Yahoo Finance returned status ${response.status}`);
      }

      const result = response.data.chart.result[0];
      if (!result) {
        throw new Error('No data available from Yahoo Finance');
      }

      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      const adjClose = result.indicators.adjclose[0];

      if (!timestamps || !quote) {
        throw new Error('Invalid data structure from Yahoo Finance');
      }

      // Transform Yahoo Finance data to match our expected format
      const data = {
        t: [], // timestamps
        o: [], // open
        h: [], // high
        l: [], // low
        c: [], // close
        v: []  // volume
      };

      timestamps.forEach((timestamp, index) => {
        data.t.push(timestamp);
        data.o.push(quote.open[index] || 0);
        data.h.push(quote.high[index] || 0);
        data.l.push(quote.low[index] || 0);
        data.c.push(adjClose && adjClose.adjclose ? adjClose.adjclose[index] || quote.close[index] || 0 : quote.close[index] || 0);
        data.v.push(quote.volume[index] || 0);
      });

      return data;
    } catch (error) {
      console.error('Error fetching historical data from Yahoo Finance:', error.message);
      throw new Error('Failed to fetch historical data from Yahoo Finance');
    }
  }

  // Get historical data from Alpha Vantage
  async getAlphaVantageHistoricalData(symbol) {
    try {
      // Skip Alpha Vantage if using demo key (limited functionality)
      if (this.alphaVantageApiKey === 'demo') {
        throw new Error('Alpha Vantage demo key has limited functionality. Please get a free API key from alphavantage.co');
      }

      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          apikey: this.alphaVantageApiKey,
          outputsize: 'compact' // Last 100 data points
        },
        timeout: 10000
      });

      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded: ' + response.data['Note']);
      }

      const timeSeriesData = response.data['Time Series (Daily)'];
      if (!timeSeriesData) {
        throw new Error('No data available from Alpha Vantage');
      }

      // Transform Alpha Vantage data to match expected format
      const dates = Object.keys(timeSeriesData).sort();
      const data = {
        t: [], // timestamps
        o: [], // open
        h: [], // high
        l: [], // low
        c: [], // close
        v: []  // volume
      };

      dates.forEach(date => {
        const dayData = timeSeriesData[date];
        data.t.push(new Date(date).getTime() / 1000); // Convert to Unix timestamp
        data.o.push(parseFloat(dayData['1. open']));
        data.h.push(parseFloat(dayData['2. high']));
        data.l.push(parseFloat(dayData['3. low']));
        data.c.push(parseFloat(dayData['4. close']));
        data.v.push(parseInt(dayData['5. volume']));
      });

      return data;
    } catch (error) {
      console.error('Error fetching historical data from Alpha Vantage:', error.message);
      throw new Error('Failed to fetch historical data from Alpha Vantage');
    }
  }

  // Get historical data with fallback to multiple free sources
  async getHistoricalData(symbol, period = '1mo') {
    const cacheKey = `${symbol}-${period}`;
    
    // Check cache first
    const cached = this.cache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < this.cacheTimeout) {
      console.log('Returning cached historical data for', symbol);
      return cached.data;
    }

    try {
      // Try Yahoo Finance first (most reliable free option)
      console.log('Trying Yahoo Finance for historical data...');
      const data = await this.getYahooFinanceHistoricalData(symbol, period);
      
      // Cache the successful result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (error) {
      console.log('Yahoo Finance failed, trying Alpha Vantage...');
      try {
        const data = await this.getAlphaVantageHistoricalData(symbol);
        
        // Cache the successful result
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        
        return data;
      } catch (alphaError) {
        console.error('All free data sources failed:', error.message, alphaError.message);
        throw new Error('Unable to fetch historical data. Yahoo Finance is rate limited and Alpha Vantage requires a free API key. Please try again later or get a free API key from alphavantage.co');
      }
    }
  }
}

module.exports = new FreeStockDataService(); 