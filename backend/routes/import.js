const express = require('express');
const { body } = require('express-validator');
const config = require('../config');
const auth = require('../middleware/auth');
const { importLimiter } = require('../middleware/rateLimiter');
const importController = require('../controllers/importController');
const { parseDate } = require('../services/import/tokens');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

const { maxLines, maxLineLength } = config.import;
const coordinate = (field) => body(`lines.*.box.${field}`)
  .isFloat({ min: -10000, max: 100000 })
  .withMessage(`box.${field} must be a number`);

// The body is OCR output from the browser, so it is untrusted input like any
// other: its shape and size are checked before the parser sees it.
const parseValidation = [
  body('today')
    .custom((value) => typeof value === 'string' && parseDate(value, value) === value)
    .withMessage('today must be a real day, YYYY-MM-DD'),
  body('model').isString().isLength({ min: 1, max: 100 }).withMessage('model is required'),
  body('image.width').isInt({ min: 1, max: 10000 }).withMessage('image.width must be 1-10000'),
  body('image.height').isInt({ min: 1, max: 10000 }).withMessage('image.height must be 1-10000'),
  body('lines').isArray({ max: maxLines }).withMessage(`lines must be an array of at most ${maxLines}`),
  body('lines.*.text').isString().isLength({ max: maxLineLength })
    .withMessage(`each line must be text of at most ${maxLineLength} characters`),
  body('lines.*.conf').isFloat({ min: 0, max: 1 }).withMessage('conf must be between 0 and 1'),
  coordinate('x'),
  coordinate('y'),
  body('lines.*.box.width').isFloat({ min: 0, max: 100000 }).withMessage('box.width must be a number'),
  body('lines.*.box.height').isFloat({ min: 0, max: 100000 }).withMessage('box.height must be a number'),
];

// Limiter after auth: it is keyed on the user.
router.post('/parse', importLimiter, parseValidation, importController.parse);

module.exports = router;
