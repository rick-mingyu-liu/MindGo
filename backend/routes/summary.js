const express = require('express');
const summaryController = require('../controllers/summaryController');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Routes
router.get('/monthly', summaryController.getMonthlySummary);
router.get('/rolling', summaryController.getRollingSummary);
router.get('/trends', summaryController.getSpendingTrends);
router.post('/checkin', summaryController.checkIn);
router.get('/checkin-streak', summaryController.getCheckinStreak);

module.exports = router; 