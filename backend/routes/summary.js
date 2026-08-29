const express = require('express');
const { query } = require('express-validator');
const summaryController = require('../controllers/summaryController');
const auth = require('../middleware/auth');
const { isTermId } = require('../utils/terms');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

/**
 * `/rolling` answers two different questions and the caller picks which:
 *
 *   ?term=2026-spring   the term. Also `current` and `previous`, so a client
 *                       never has to know the calendar.
 *   ?months=4           a rolling count back from today. The original.
 *
 * They are mutually exclusive rather than one silently winning: a request
 * carrying both is a client bug, and answering it with either interpretation
 * would hide that. See IMPROVEMENTS.md item 20.
 */
const TERM_ALIASES = ['current', 'previous'];

const rollingValidation = [
  query('term').optional()
    .custom((value) => TERM_ALIASES.includes(value) || isTermId(value))
    .withMessage(`term must be current, previous, or an id like 2026-spring`),
  query('months').optional().isInt({ min: 1, max: 60 })
    .withMessage('months must be a whole number between 1 and 60'),
  query('months').custom((value, { req }) => {
    if (value !== undefined && req.query.term !== undefined) {
      throw new Error('pass either term or months, not both');
    }
    return true;
  }),
];

// Routes
router.get('/monthly', summaryController.getMonthlySummary);
router.get('/rolling', rollingValidation, summaryController.getRollingSummary);
router.get('/trends', summaryController.getSpendingTrends);

module.exports = router; 