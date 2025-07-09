const axios = require('axios');

// Simple in-memory cache
const cache = {};
const CACHE_DURATION_MS = 60 * 60 * 1000; // 1 hour

/**
 * Fetches the exchange rate from one currency to another using ExchangeRate.host
 * @param {string} from - The base currency (e.g., 'USD')
 * @param {string} to - The target currency (e.g., 'CAD')
 * @returns {Promise<number>} - The exchange rate
 */
async function getExchangeRate(from, to) {
  const cacheKey = `${from}_${to}`;
  const now = Date.now();
  if (cache[cacheKey] && (now - cache[cacheKey].timestamp < CACHE_DURATION_MS)) {
    return cache[cacheKey].rate;
  }
  const url = `https://api.exchangerate.host/latest?base=${from}&symbols=${to}`;
  const response = await axios.get(url);
  if (response.data && response.data.success && response.data.rates && response.data.rates[to]) {
    const rate = response.data.rates[to];
    cache[cacheKey] = { rate, timestamp: now };
    return rate;
  } else {
    throw new Error('Failed to fetch exchange rate');
  }
}

module.exports = { getExchangeRate }; 