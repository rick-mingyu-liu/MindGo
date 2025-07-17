const cryptoService = require('../services/cryptoService');

// GET /crypto/:symbol - fetch info for a single coin
async function getCryptoInfo(req, res) {
  const { symbol } = req.params;
  try {
    const data = await cryptoService.getCryptoInfo(symbol);
    if (!data) {
      return res.status(404).json({ error: `Coin ${symbol} not found on Binance.` });
    }
    res.json(data);
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch crypto info', details: err.message });
  }
}

// GET /crypto?symbols=BTCUSDT,ETHUSDT - fetch info for multiple coins
async function getMultipleCryptoInfo(req, res) {
  const { symbols } = req.query;
  if (!symbols) {
    return res.status(400).json({ error: 'Missing symbols query parameter' });
  }
  const symbolArr = symbols.split(',').map(s => s.trim()).filter(Boolean);
  try {
    const data = await cryptoService.getMultipleCryptoInfo(symbolArr);
    // If any requested symbol is missing, include info in response
    const missing = symbolArr.filter(s => !data.find(d => d && d.symbol === s));
    res.json({ data, missing });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch crypto info', details: err.message });
  }
}

module.exports = {
  getCryptoInfo,
  getMultipleCryptoInfo
}; 