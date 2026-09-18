import axios from 'axios';
import config = require('../config');

const FINNHUB_API_KEY = config.apiKeys.finnhub;
const FINNHUB_BASE_URL = 'https://finnhub.io/api/v1';
const FINNHUB_TOKEN = config.apiKeys.finnhubToken;
const ALPHA_VANTAGE_API_KEY = config.apiKeys.alphaVantage;

/**
 * Fields `controllers/investmentController.ts` actually reads off a quote —
 * not Finnhub's documented shape, which has more of them (o, pc, t) than
 * anything in this codebase uses.
 */
interface FinnhubQuoteResponse {
  c?: number;
  d?: number;
  dp?: number;
  h?: number;
  l?: number;
  v?: number;
}

/** Fields `investmentController.ts` reads off a company profile. */
interface FinnhubProfileResponse {
  name?: string;
  country?: string;
  finnhubIndustry?: string;
  gsector?: string;
  exchange?: string;
  employeeTotal?: number;
  weburl?: string;
  description?: string;
  logo?: string;
  ipo?: string;
  phone?: string;
  ticker?: string;
  marketCapitalization?: number;
  '52WeekLow'?: number;
  '52WeekHigh'?: number;
}

/** A single line item inside a financial statement's bs/ic/cf array. */
interface FinnhubFinancialLineItem {
  concept?: string;
  label?: string;
  value?: number;
}

interface FinnhubFinancialStatement {
  bs?: FinnhubFinancialLineItem[];
  ic?: FinnhubFinancialLineItem[];
  cf?: FinnhubFinancialLineItem[];
}

/** Fields `investmentController.ts`'s getStockFinancials reads off each report. */
interface FinnhubFinancialReport {
  report?: FinnhubFinancialStatement;
  period?: string;
  filedDate?: string;
  endDate?: string;
  startDate?: string;
  form?: string;
  periodType?: string;
  accessNumber?: string;
  cik?: string;
}

interface FinnhubFinancialsResponse {
  data?: FinnhubFinancialReport[];
}

/** Shared with freeStockDataService: the OHLCV arrays both fall back to. */
interface HistoricalBars {
  t: number[];
  o: number[];
  h: number[];
  l: number[];
  c: number[];
  v: number[];
}

interface AlphaVantageDailyBar {
  '1. open': string;
  '2. high': string;
  '3. low': string;
  '4. close': string;
  '5. volume': string;
}

interface AlphaVantageTimeSeriesResponse {
  'Error Message'?: string;
  Note?: string;
  'Time Series (Daily)'?: Record<string, AlphaVantageDailyBar>;
}

class FinnhubService {
  constructor() {
    // Deliberately empty. This used to throw when FINNHUB_API_KEY was absent,
    // but the module is exported as an instance, so the constructor runs at
    // require time — which took down the entire API at boot, not just the
    // stock endpoints, because investmentController requires it. It also
    // defeated the layered design: callers already fall back to
    // freeStockDataService (Yahoo, then Alpha Vantage), so a missing key
    // should degrade to the free path rather than be fatal.
    // config/validate.ts reports the missing key at startup.
  }

  // Get real-time quote for a stock
  async getQuote(symbol: string): Promise<FinnhubQuoteResponse> {
    try {
      const response = await axios.get<FinnhubQuoteResponse>(`${FINNHUB_BASE_URL}/quote`, {
        params: { symbol, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching quote from Finnhub:', axios.isAxiosError(error)
        ? (error.response?.data || error.message)
        : error instanceof Error ? error.message : error);
      throw new Error('Failed to fetch quote');
    }
  }

  // Get company news for a stock
  async getNews(symbol: string, from: string, to: string): Promise<unknown[]> {
    try {
      const response = await axios.get<unknown[]>(`${FINNHUB_BASE_URL}/company-news`, {
        params: { symbol, from, to, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching news from Finnhub:', axios.isAxiosError(error)
        ? (error.response?.data || error.message)
        : error instanceof Error ? error.message : error);
      throw new Error('Failed to fetch news');
    }
  }

  // Get financial reports for a stock
  async getFinancials(symbol: string): Promise<FinnhubFinancialsResponse> {
    try {
      const response = await axios.get<FinnhubFinancialsResponse>(`${FINNHUB_BASE_URL}/stock/financials-reported`, {
        params: { symbol, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching financials from Finnhub:', axios.isAxiosError(error)
        ? (error.response?.data || error.message)
        : error instanceof Error ? error.message : error);
      throw new Error('Failed to fetch financials');
    }
  }

  // Get historical data for a stock (try Alpha Vantage as fallback)
  async getHistoricalData(symbol: string, resolution: string = 'D', from?: string, to?: string): Promise<unknown> {
    try {
      // First try Finnhub
      const response = await axios.get<unknown>(`${FINNHUB_BASE_URL}/stock/candle`, {
        params: { symbol, resolution, from, to, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (_error) {
      console.log('Finnhub historical data failed, trying Alpha Vantage...');
      // Fallback to Alpha Vantage
      return await this.getAlphaVantageHistoricalData(symbol);
    }
  }

  // Get historical data from Alpha Vantage (free alternative)
  async getAlphaVantageHistoricalData(symbol: string): Promise<HistoricalBars> {
    try {
      const response = await axios.get<AlphaVantageTimeSeriesResponse>('https://www.alphavantage.co/query', {
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
      const data: HistoricalBars = {
        t: [], // timestamps
        o: [], // open
        h: [], // high
        l: [], // low
        c: [], // close
        v: []  // volume
      };

      dates.forEach(date => {
        const dayData = timeSeriesData[date];
        // Guard only: date always comes from Object.keys(timeSeriesData), so
        // this is never actually undefined — noUncheckedIndexedAccess just
        // can't see that.
        if (!dayData) return;
        data.t.push(new Date(date).getTime() / 1000); // Convert to Unix timestamp
        data.o.push(parseFloat(dayData['1. open']));
        data.h.push(parseFloat(dayData['2. high']));
        data.l.push(parseFloat(dayData['3. low']));
        data.c.push(parseFloat(dayData['4. close']));
        data.v.push(parseInt(dayData['5. volume']));
      });

      return data;
    } catch (error) {
      console.error('Error fetching historical data from Alpha Vantage:', error instanceof Error ? error.message : error);
      throw new Error('Failed to fetch historical data from Alpha Vantage');
    }
  }

  // Search for stocks/companies by name or symbol
  async searchSymbol(query: string): Promise<unknown> {
    try {
      const response = await axios.get<unknown>(`${FINNHUB_BASE_URL}/search`, {
        params: { q: query, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching symbol from Finnhub:', axios.isAxiosError(error)
        ? (error.response?.data || error.message)
        : error instanceof Error ? error.message : error);
      throw new Error('Failed to search symbol');
    }
  }

  // Get company profile for a stock
  async getProfile(symbol: string): Promise<FinnhubProfileResponse> {
    try {
      const response = await axios.get<FinnhubProfileResponse>(`${FINNHUB_BASE_URL}/stock/profile2`, {
        params: { symbol, token: FINNHUB_API_KEY }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching profile from Finnhub:', axios.isAxiosError(error)
        ? (error.response?.data || error.message)
        : error instanceof Error ? error.message : error);
      throw new Error('Failed to fetch profile');
    }
  }

  // Fetch recommendation trends
  async getRecommendationTrends(symbol: string): Promise<unknown> {
    const url = `https://finnhub.io/api/v1/stock/recommendation?symbol=${symbol}&token=${FINNHUB_TOKEN}`;
    const { data } = await axios.get<unknown>(url);
    return data;
  }

  // EPS Surprises (last 4 quarters)
  async getEpsSurprises(symbol: string): Promise<unknown> {
    const url = `${FINNHUB_BASE_URL}/stock/earnings`;
    const { data } = await axios.get<unknown>(url, {
      params: { symbol, token: FINNHUB_API_KEY }
    });
    return data;
  }

  // Earnings Calendar (1 month, US only)
  async getEarningsCalendar(symbol: string): Promise<unknown> {
    const url = `${FINNHUB_BASE_URL}/calendar/earnings`;
    const { data } = await axios.get<unknown>(url, {
      params: { symbol, token: FINNHUB_API_KEY }
    });
    return data;
  }
}

export = new FinnhubService();
