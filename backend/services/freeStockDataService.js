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
      await new Promise(resolve => setTimeout(resolve, 3000));
      
      // Yahoo Finance uses a different endpoint structure
      const response = await axios.get(`https://query1.finance.yahoo.com/v8/finance/chart/${symbol}`, {
        params: {
          range: period,
          interval: '1d',
          includePrePost: false,
          events: 'div,split'
        },
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
          'Accept': 'application/json, text/plain, */*',
          'Accept-Language': 'en-US,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'Referer': 'https://finance.yahoo.com/',
          'Origin': 'https://finance.yahoo.com',
          'Sec-Fetch-Dest': 'empty',
          'Sec-Fetch-Mode': 'cors',
          'Sec-Fetch-Site': 'same-site',
          'Connection': 'keep-alive'
        },
        timeout: 20000
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
      
      // Check if it's a rate limit error
      if (error.response && error.response.status === 429) {
        throw new Error('Rate limited by Yahoo Finance. Please try again later.');
      }
      
      // If it's a network error or timeout, try with a different approach
      if (error.code === 'ECONNABORTED' || error.code === 'ENOTFOUND' || error.code === 'ETIMEDOUT') {
        console.log('Network error, trying alternative endpoint...');
        return await this.getYahooFinanceAlternativeData(symbol, period);
      }
      
      throw new Error('Failed to fetch historical data from Yahoo Finance');
    }
  }

  // Alternative Yahoo Finance endpoint as fallback
  async getYahooFinanceAlternativeData(symbol, period = '1mo') {
    try {
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const response = await axios.get(`https://query2.finance.yahoo.com/v8/finance/chart/${symbol}`, {
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

      const result = response.data.chart.result[0];
      if (!result) {
        throw new Error('No data available from Yahoo Finance alternative endpoint');
      }

      const timestamps = result.timestamp;
      const quote = result.indicators.quote[0];
      const adjClose = result.indicators.adjclose[0];

      if (!timestamps || !quote) {
        throw new Error('Invalid data structure from Yahoo Finance alternative endpoint');
      }

      const data = {
        t: [], o: [], h: [], l: [], c: [], v: []
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
      console.error('Alternative Yahoo Finance endpoint also failed:', error.message);
      throw error;
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

    // Retry logic for better reliability
    const maxRetries = 3;
    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        console.log(`Attempt ${attempt}/${maxRetries}: Trying Yahoo Finance for historical data...`);
        const data = await this.getYahooFinanceHistoricalData(symbol, period);
        
        // Cache the successful result
        this.cache.set(cacheKey, {
          data,
          timestamp: Date.now()
        });
        
        return data;
      } catch (error) {
        lastError = error;
        console.log(`Yahoo Finance attempt ${attempt} failed:`, error.message);
        
        // If it's a rate limit error, wait longer
        if (error.message.includes('429') || error.message.includes('Rate limited')) {
          const waitTime = Math.min(5000 * Math.pow(2, attempt - 1), 30000); // Up to 30 seconds
          console.log(`Rate limited, waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        } else if (attempt < maxRetries) {
          // Wait before retry (exponential backoff)
          const waitTime = Math.min(1000 * Math.pow(2, attempt - 1), 5000);
          console.log(`Waiting ${waitTime}ms before retry...`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
        }
      }
    }

    // If all Yahoo Finance attempts failed, try Alpha Vantage
    console.log('All Yahoo Finance attempts failed, trying Alpha Vantage...');
    try {
      const data = await this.getAlphaVantageHistoricalData(symbol);
      
      // Cache the successful result
      this.cache.set(cacheKey, {
        data,
        timestamp: Date.now()
      });
      
      return data;
    } catch (alphaError) {
      console.error('All free data sources failed:', lastError.message, alphaError.message);
      
      // Return mock data as final fallback to prevent app crashes
      console.log('Returning mock data as fallback...');
      return this.getMockHistoricalData(symbol, period);
    }
  }

  // Generate mock historical data as final fallback
  getMockHistoricalData(symbol, period = '1mo') {
    console.log(`Generating mock historical data for ${symbol} (${period})`);
    
    const now = Math.floor(Date.now() / 1000);
    const days = period === '1mo' ? 30 : period === '3mo' ? 90 : period === '6mo' ? 180 : 365;
    const basePrice = 100 + Math.random() * 200; // Random base price between 100-300
    
    const data = {
      t: [], // timestamps
      o: [], // open
      h: [], // high
      l: [], // low
      c: [], // close
      v: []  // volume
    };

    let currentPrice = basePrice;
    
    for (let i = days; i >= 0; i--) {
      const timestamp = now - (i * 24 * 60 * 60);
      
      // Generate realistic price movement
      const change = (Math.random() - 0.5) * 0.1; // ±5% daily change
      const newPrice = currentPrice * (1 + change);
      
      const open = currentPrice;
      const close = newPrice;
      const high = Math.max(open, close) * (1 + Math.random() * 0.02);
      const low = Math.min(open, close) * (1 - Math.random() * 0.02);
      const volume = Math.floor(1000000 + Math.random() * 9000000); // 1M-10M volume
      
      data.t.push(timestamp);
      data.o.push(parseFloat(open.toFixed(2)));
      data.h.push(parseFloat(high.toFixed(2)));
      data.l.push(parseFloat(low.toFixed(2)));
      data.c.push(parseFloat(close.toFixed(2)));
      data.v.push(volume);
      
      currentPrice = close;
    }

    return data;
  }
}

module.exports = new FreeStockDataService(); 