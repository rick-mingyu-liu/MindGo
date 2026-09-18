import express from 'express';
import { query } from 'express-validator';
import summaryController = require('../controllers/summaryController');
import auth = require('../middleware/auth');
import { isTermId, isYearId } from '../utils/terms';

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

/**
 * `/rolling` answers three different questions and the caller picks which:
 *
 *   ?term=2026-spring   the term. Also `current` and `previous`, so a client
 *                       never has to know the calendar.
 *   ?year=2026          the calendar year, which in this calendar is exactly
 *                       Winter + Spring + Fall. Also `current` and `previous`.
 *   ?months=4           a rolling count back from today. The original.
 *
 * They are mutually exclusive rather than one silently winning: a request
 * carrying more than one is a client bug, and answering it with any single
 * interpretation would hide that.
 */
const RELATIVE = ['current', 'previous'];

const rollingValidation = [
  query('term').optional()
    .custom((value) => RELATIVE.includes(value) || isTermId(value))
    .withMessage(`term must be current, previous, or an id like 2026-spring`),
  query('year').optional()
    .custom((value) => RELATIVE.includes(value) || isYearId(value))
    .withMessage('year must be current, previous, or a four-digit year like 2026'),
  query('months').optional().isInt({ min: 1, max: 60 })
    .withMessage('months must be a whole number between 1 and 60'),
  // Hung off `months` only because a validator has to hang off something; the
  // check is about the request as a whole.
  query('months').custom((_value, { req }) => {
    // express-validator's own Meta type declares `req.query?: Record<string,
    // any>` (optional) rather than Express's actual Request type, so without
    // the ?. this is TS18048 "'req.query' is possibly 'undefined'" — Express
    // itself always sets req.query to an object, so this never actually goes
    // through the undefined branch.
    const given = ['term', 'year', 'months'].filter((k) => req.query?.[k] !== undefined);
    if (given.length > 1) {
      throw new Error(`pass one of term, year or months, not ${given.join(' and ')}`);
    }
    return true;
  }),
];

// Routes
router.get('/monthly', summaryController.getMonthlySummary);
router.get('/rolling', rollingValidation, summaryController.getRollingSummary);
router.get('/trends', summaryController.getSpendingTrends);

export = router;
