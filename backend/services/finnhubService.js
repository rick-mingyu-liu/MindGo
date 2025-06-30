const axios = require('axios');

const FINNHUB_API_KEY = process.env.FINNHUB_API_KEY;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_TOKEN = process.env.FINNHUB_TOKEN;

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

  // Get historical data for a stock
  async getHistoricalData(symbol, resolution = 'D', from, to) {
    try {
      const response = await axios.get(`${FINNHUB_BASE_URL}/stock/candle`, {
        params: { symbol, resolution, from, to, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching historical data from Finnhub:', error.response?.data || error.message);
      throw new Error('Failed to fetch historical data');
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
}

module.exports = new FinnhubService(); 