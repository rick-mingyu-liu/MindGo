import express from 'express';
import { body, query } from 'express-validator';
import config = require('../config');
import transactionController = require('../controllers/transactionController');
import auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY'];

// Validation middleware
const transactionValidation = [
  body('amount').isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('description').notEmpty().withMessage('Description is required'),
  body('category').notEmpty().withMessage('Category is required'),
  body('type').isIn(['income', 'expense']).withMessage('Type must be either income or expense'),
  body('date').isISO8601().withMessage('Date must be a valid date'),
  body('currency').isIn(CURRENCIES).withMessage('Currency must be one of CAD, USD, EUR, GBP, AUD, CNY')
];

// Rows confirmed on the screenshot import screen. The same rules as a manual
// entry, applied to every row, plus two the import needs: amounts arrive as
// two-place strings (the parser never turns them into floats), and each row
// says which path read it and whether the user corrected it.
const { maxRows } = config.import;
const importValidation = [
  body('rows').isArray({ min: 1, max: maxRows })
    .withMessage(`rows must hold between 1 and ${maxRows} transactions`),
  body('rows.*.amount')
    .isString().matches(/^\d{1,8}\.\d{2}$/).withMessage('Amount must be a decimal string like 12.50')
    .bail()
    .isFloat({ min: 0.01 }).withMessage('Amount must be a positive number'),
  body('rows.*.description').isString().trim().notEmpty().withMessage('Description is required')
    .isLength({ max: 255 }).withMessage('Description must be at most 255 characters'),
  body('rows.*.category').isString().trim().notEmpty().withMessage('Category is required')
    .isLength({ max: 100 }).withMessage('Category must be at most 100 characters'),
  body('rows.*.type').isIn(['income', 'expense']).withMessage('Type must be either income or expense'),
  body('rows.*.date')
    .isString().matches(/^\d{4}-\d{2}-\d{2}$/).withMessage('Date must be YYYY-MM-DD')
    .bail()
    .isISO8601({ strict: true }).withMessage('Date must be a real day'),
  body('rows.*.currency').isIn(CURRENCIES).withMessage('Currency must be one of CAD, USD, EUR, GBP, AUD, CNY'),
  body('rows.*.source').isIn(['ocr', 'ocr_llm']).withMessage('source must be ocr or ocr_llm'),
  body('rows.*.edited').isBoolean({ strict: true }).withMessage('edited must be true or false'),
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
router.post('/import', importValidation, transactionController.importTransactions);
router.get('/categories', transactionController.getCategories);
router.delete('/clear-all', transactionController.clearAllTransactions);
router.delete('/auto-delete', autoDeleteValidation, transactionController.autoDeleteOldTransactions);
router.get('/retention-settings', transactionController.getDataRetentionSettings);
router.put('/retention-settings', transactionController.updateDataRetentionSettings);
router.put('/:id', transactionValidation, transactionController.updateTransaction);
router.delete('/:id', transactionController.deleteTransaction);


export = router;
