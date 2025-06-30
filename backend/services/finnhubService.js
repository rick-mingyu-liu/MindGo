const axios = require('axios');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;
const ALPHA_VANTAGE_API_KEY = process.env.ALPHA_VANTAGE_API_KEY || 'demo'; // Use demo key as fallback

class FinnhubService {
  constructor() {
    if (!FINNHUB_API_KEY) {
      throw new Error('Finnhub API key is not set in environment variables');
    }
  }

  // Get real-time quote for a stock
  async getQuote(symbol) {
    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/quote`, {
        params: { symbol, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching quote from Finnhub:', error.response?.data || error.message);
      throw new Error('Failed to fetch quote');
    }
  }

  // Get company news for a stock
  async getNews(symbol, from, to) {
    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/company-news`, {
        params: { symbol, from, to, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching news from Finnhub:', error.response?.data || error.message);
      throw new Error('Failed to fetch news');
    }
  }

  // Get financial reports for a stock
  async getFinancials(symbol) {
    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/stock/financials-reported`, {
        params: { symbol, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching financials from Finnhub:', error.response?.data || error.message);
      throw new Error('Failed to fetch financials');
    }
  }

  // Get historical data for a stock (try Alpha Vantage as fallback)
  async getHistoricalData(symbol, resolution = 'D', from, to) {
    try {
      // First try Finnhub
      const response = await axios.get(`${FINNHUB_BASE_URL}/stock/candle`, {
        params: { symbol, resolution, from, to, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.log('Finnhub historical data failed, trying Alpha Vantage...');
      // Fallback to Alpha Vantage
      return await this.getAlphaVantageHistoricalData(symbol);
    }
  }

  // Get historical data from Alpha Vantage (free alternative)
  async getAlphaVantageHistoricalData(symbol) {
    try {
      const response = await axios.get('https://www.alphavantage.co/query', {
        params: {
          function: 'TIME_SERIES_DAILY',
          symbol: symbol,
          apikey: ALPHA_VANTAGE_API_KEY,
          outputsize: 'compact' // Last 100 data points
        }
      });

      if (response.data['Error Message']) {
        throw new Error(response.data['Error Message']);
      }

      if (response.data['Note']) {
        throw new Error('API rate limit exceeded: ' + response.data['Note']);
      }

      const timeSeriesData = response.data['Time Series (Daily)'];
      if (!timeSeriesData) {
        throw new Error('No data available');
      }

      // Transform Alpha Vantage data to match Finnhub format
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

  // Search for stocks/companies by name or symbol
  async searchSymbol(query) {
    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/search`, {
        params: { q: query, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching symbol from Finnhub:', error.response?.data || error.message);
      throw new Error('Failed to search symbol');
    }
  }

  // Get company profile for a stock
  async getProfile(symbol) {
    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/stock/profile2`, {
        params: { symbol, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching profile from Finnhub:', error.response?.data || error.message);
      throw new Error('Failed to fetch profile');
    }
  }

  // Fetch key indicators (SMA, EMA, RSI, MACD)
  async getKeyIndicators(symbol) {
    const url = `https://finnhub.io/api/v1/indicator?symbol=${symbol}&resolution=D&indicator=sma,ema,rsi,macd&token=${FINNHUB_TOKEN}`;
    const { data } = await axios.get(url);
    return {
      sma: data.sma?.values?.slice(-1)[0] ?? null,
      ema: data.ema?.values?.slice(-1)[0] ?? null,
      rsi: data.rsi?.values?.slice(-1)[0] ?? null,
      macd: data.macd?.macd?.slice(-1)[0] ?? null
    };
  }

  // Fetch recommendation trends
  async getRecommendationTrends(symbol) {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_TOKEN}`;
    const { data } = await axios.get(url);
    return data;
  }

  // EPS Surprises (last 4 quarters)
  async getEpsSurprises(symbol) {
    const url = `${FINNHUB_BASE_URL}/stock/earnings`;
    const { data } = await axios.get(url, {
      params: { symbol, token: FINNHUB_API_KEY }
    });
    return data;
  }

  // Earnings Calendar (1 month, US only)
  async getEarningsCalendar(symbol) {
    const url = `${FINNHUB_BASE_URL}/calendar/earnings`;
    const { data } = await axios.get(url, {
      params: { symbol, token: FINNHUB_API_KEY }
    });
    return data;
  }
}

module.exports = new FinnhubService(); 