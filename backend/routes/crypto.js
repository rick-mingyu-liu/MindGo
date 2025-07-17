const express = require('express');
const router = express.Router();
const cryptoController = require('../controllers/cryptoController');

// GET /crypto/:symbol - single coin
router.get('/:symbol', cryptoController.getCryptoInfo);

// GET /crypto?symbols=BTCUSDT,ETHUSDT - batch coins
router.get('/', cryptoController.getMultipleCryptoInfo);

module.exports = router; 