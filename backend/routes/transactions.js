const express = require('express');
const { body, query } = require('express-validator');
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
  body('date').isISO8601().withMessage('Date must be a valid date'),
  body('currency').isIn(['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY']).withMessage('Currency must be one of CAD, USD, EUR, GBP, AUD, CNY')
];

// `months` here is not the `months` of GET /summary/rolling. There it means
// "show me the last N months"; here it means "destroy everything older than N
// months", with the same name, the same type and the same default of 4. It was
// unvalidated: ?months=0 set the cutoff to today and deleted the caller's whole
// history, ?months=-6 set it six months into the future and deleted everything
// including future-dated rows, and ?months= (empty) threw inside toISOString()
// and returned a 500 -- `const { months = 4 }` defaults only on undefined.
//
// 1-60 is not invented: it is the range updateDataRetentionSettings already
// enforces on the same concept, so the write path and the settings path agree.
const autoDeleteValidation = [
  query('months').optional().isInt({ min: 1, max: 60 })
    .withMessage('months must be a whole number between 1 and 60'),
];

// Routes
router.get('/', transactionController.getTransactions);
router.post('/', transactionValidation, transactionController.createTransaction);
router.get('/categories', transactionController.getCategories);
router.delete('/clear-all', transactionController.clearAllTransactions);
router.delete('/auto-delete', autoDeleteValidation, transactionController.autoDeleteOldTransactions);
router.get('/retention-settings', transactionController.getDataRetentionSettings);
router.put('/retention-settings', transactionController.updateDataRetentionSettings);
router.put('/:id', transactionValidation, transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);

module.exports = router; 