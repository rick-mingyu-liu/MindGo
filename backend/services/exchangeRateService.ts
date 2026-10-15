import axios from 'axios';

// Simple in-memory cache
const cache: Record<string, { rate: number; timestamp: number } | undefined> = {};
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour
// A hung provider must fail a conversion, not hold a request (or an agent turn) open.
const REQUEST_TIMEOUT_MS = 5000;

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
  const response = await axios.get<FrankfurterResponse>(url, { timeout: REQUEST_TIMEOUT_MS });
  const rate = response.data?.rates?.[to];
  // Zero, negative, NaN or Infinity would each turn every converted total into
  // a plausible wrong number (or none at all), so they fail like a missing rate.
  if (typeof rate === 'number' && Number.isFinite(rate) && rate > 0) {
    cache[cacheKey] = { rate, timestamp: now };
    return rate;
  } else {
    throw new Error('Failed to fetch exchange rate');
  }
}

export { getExchangeRate };
