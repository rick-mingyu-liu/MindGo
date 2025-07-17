const axios = require('axios');

// Helper: Map Binance symbol (e.g., BTCUSDT) to CoinGecko id (e.g., bitcoin)
const symbolToCoinGeckoId = {
  BTCUSDT: 'bitcoin',
  ETHUSDT: 'ethereum',
  BNBUSDT: 'binancecoin',
  SOLUSDT: 'solana',
  ADAUSDT: 'cardano',
  XRPUSDT: 'ripple',
  DOGEUSDT: 'dogecoin',
  AVAXUSDT: 'avalanche-2',
  MATICUSDT: 'matic-network',
  // Add more as needed
};

// Manual fallback info for coins not on CoinGecko
const manualFallbacks = {
  PENGUUSDT: {
    description: 'Pengu is a meme coin on BSC.',
    image: '/crypto-logos/pengu.png',
  },
  // Add more as needed
};

// Search CoinGecko for a coin ID by symbol (e.g., 'SOLUSDT' → 'solana')
async function searchCoinGeckoId(symbol) {
  try {
    const { data } = await axios.get('https://api.coingecko.com/api/v3/coins/list');
    const base = symbol.replace('USDT', '').toLowerCase();
    const found = data.find(coin => coin.symbol.toLowerCase() === base);
    return found ? found.id : null;
  } catch (err) {
    return null;
  }
}

// Fetch info for a single coin (e.g., 'BTCUSDT')
async function getCryptoInfo(symbol) {
  const url = `https://api.binance.com/api/v3/ticker/24hr?symbol=${symbol}`;
  try {
    const response = await axios.get(url);
    const binanceData = response.data;
    // Try to get CoinGecko info
    let geckoId = symbolToCoinGeckoId[symbol];
    if (!geckoId) {
      geckoId = await searchCoinGeckoId(symbol);
    }
    let geckoData = null;
    if (geckoId) {
      geckoData = await getCoinGeckoInfo(geckoId);
    }
    // If no CoinGecko data, try manual fallback
    if (!geckoData && manualFallbacks[symbol]) {
      geckoData = manualFallbacks[symbol];
    }
    return {
      ...binanceData,
      market_cap: geckoData?.market_cap,
      circulating_supply: geckoData?.circulating_supply,
      description: geckoData?.description,
      gecko_id: geckoId || null,
      image: geckoData?.image || null
    };
  } catch (err) {
    return null;
  }
}

// Fetch info for multiple coins (array of symbols)
async function getMultipleCryptoInfo(symbols) {
  // Binance API does not support batch for /ticker/24hr, so fetch in parallel
  const promises = symbols.map(symbol => getCryptoInfo(symbol).catch(() => null));
  const results = await Promise.all(promises);
  return results.filter(Boolean); // Remove failed fetches
}

// Fetch market cap and description from CoinGecko
async function getCoinGeckoInfo(geckoId) {
  try {
    const url = `https://api.coingecko.com/api/v3/coins/${geckoId}`;
    const { data } = await axios.get(url);
    return {
      market_cap: data.market_data?.market_cap?.usd,
      circulating_supply: data.market_data?.circulating_supply,
      description: data.description?.en,
      image: data.image?.large,
    };
  } catch (err) {
    return null;
  }
}

module.exports = {
  getCryptoInfo,
  getMultipleCryptoInfo
}; 