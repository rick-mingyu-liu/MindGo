import express from 'express';
import investmentController = require('../controllers/investmentController');
import { investmentsRetired } from '../controllers/retiredFeatures';
import auth = require('../middleware/auth');

const router = express.Router();
router.use(auth);

// Keep Settings' explicit archive deletion ahead of the retirement response.
router.delete('/watchlist/clear-all', investmentController.clearAllWatchlist);
router.use(investmentsRetired);

export = router;
