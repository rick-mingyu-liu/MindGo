import axios from 'axios';

// Simple in-memory cache
const cache: Record<string, { rate: number; timestamp: number } | undefined> = {};
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

interface FrankfurterResponse {
  rates?: Record<string, number | undefined>;
}

/**
 * Fetches the exchange rate from one currency to another using ExchangeRate.host
 * @param {string} from - The base currency (e.g., 'USD')
 * @param {string} to - The target currency (e.g., 'CAD')
 * @returns {Promise<number>} - The exchange rate
 */
async function getExchangeRate(from: string, to: string): Promise<number> {
  const cacheKey = `${from}_${to}`;
  const now = Date.now();
  const hit = cache[cacheKey];
  if (hit && (now - hit.timestamp < CACHE_DURATION_MS)) {
    return hit.rate;
  }
  const url = `https://api.frankfurter.dev/v1/latest?base=${from}&symbols=${to}`;
  const response = await axios.get<FrankfurterResponse>(url);
  if (response.data && response.data.rates && typeof response.data.rates[to] === 'number') {
    const rate = response.data.rates[to];
    cache[cacheKey] = { rate, timestamp: now };
    return rate;
  } else {
    throw new Error('Failed to fetch exchange rate');
  }
}

export { getExchangeRate };
