const express = require('express');
const { body } = require('express-validator');
const transactionController = require('../controllers/transactionController');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Validation middleware
const transactionValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('description').notEmpty().withMessage('Description is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('type').isIn(['income', 'expense']).withMessage('Type must be either income or expense'),
  body('date').isISO8601().withMessage('Date must be a valid date')
];

// Routes
router.get('/', transactionController.getTransactions);
router.post('/', transactionValidation, transactionController.createTransaction);
router.get('/categories', transactionController.getCategories);
router.delete('/clear-all', transactionController.clearAllTransactions);
router.put('/:id', transactionValidation, transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router; 