import express from 'express';
import { body, param } from 'express-validator';
import auth = require('../middleware/auth');
import { accessTokenLimiter } from '../middleware/rateLimiter';
import accessTokenController = require('../controllers/accessTokenController');

const router = express.Router();

// Before auth, so a 401 is not cached either: a response here may carry a
// token that is shown once, and no proxy or browser cache should keep it.
router.use((_req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

// Apply auth middleware to all routes
router.use(auth);

const nameValidation = [
  body('name').isString().withMessage('name is required').bail()
    .trim().isLength({ min: 1, max: 60 }).withMessage('name must be 1-60 characters'),
];

const idValidation = [
  param('id').isInt({ min: 1, max: 2147483647 }).withMessage('id must be a positive whole number'),
];

router.get('/', accessTokenController.list);
// Limiter after auth: it is keyed on the user.
router.post('/', accessTokenLimiter, nameValidation, accessTokenController.create);
router.delete('/:id', accessTokenLimiter, idValidation, accessTokenController.revoke);

export = router;
