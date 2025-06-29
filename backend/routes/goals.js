const express = require('express');
const { body } = require('express-validator');
const goalController = require('../controllers/goalController');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Validation middleware
const goalValidation = [
  body('name').notEmpty().withMessage('Goal name is required'),
  body('target_amount').isFloat({ min: 0.01 }).withMessage('Target amount must be a positive number'),
  body('current_amount').optional().isFloat({ min: 0 }).withMessage('Current amount must be a non-negative number'),
  body('target_date').optional().isISO8601().withMessage('Target date must be a valid date')
];

const progressValidation = [
  body('current_amount').isFloat({ min: 0 }).withMessage('Current amount must be a non-negative number')
];

// Routes
router.get('/', goalController.getGoals);
router.post('/', goalValidation, goalController.createGoal);
router.get('/stats', goalController.getGoalStats);
router.delete('/clear-all', goalController.clearAllGoals);
router.put('/:id', goalValidation, goalController.updateGoal);
router.delete('/:id', goalController.deleteGoal);
router.put('/:id/progress', progressValidation, goalController.updateProgress);

module.exports = router; 