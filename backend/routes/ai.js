const express = require('express');
const { body } = require('express-validator');
const aiController = require('../controllers/aiController');
const auth = require('../middleware/auth');

const router = express.Router();

// Apply auth middleware to all routes
router.use(auth);

// Validation middleware - handle both old and new frontend formats
const planValidation = [
  body('prompt').optional().notEmpty().withMessage('Prompt cannot be empty if provided'),
  body('financialGoal').optional().notEmpty().withMessage('Financial goal cannot be empty if provided'),
  body('includeFinancialData').optional().isBoolean().withMessage('includeFinancialData must be a boolean'),
  body('currentIncome').optional().isFloat({ min: 0 }).withMessage('Current income must be a non-negative number'),
  body('currentExpenses').optional().isFloat({ min: 0 }).withMessage('Current expenses must be a non-negative number'),
  body('timeline').optional().notEmpty().withMessage('Timeline cannot be empty if provided'),
  body('additionalContext').optional().isString().withMessage('Additional context must be a string'),
  // Custom validation to ensure either prompt or financialGoal is provided
  (req, res, next) => {
    if (!req.body.prompt && !req.body.financialGoal) {
      return res.status(400).json({ 
        error: 'Either prompt or financialGoal is required' 
      });
    }
    next();
  }
];

const investmentAdviceValidation = [
  body('riskTolerance').optional().isIn(['low', 'moderate', 'high']).withMessage('Risk tolerance must be low, moderate, or high'),
  body('investmentAmount').optional().isFloat({ min: 0 }).withMessage('Investment amount must be a non-negative number'),
  body('timeHorizon').optional().notEmpty().withMessage('Time horizon cannot be empty'),
  body('goals').optional().isArray().withMessage('Goals must be an array')
];

// Routes
router.post('/plan', planValidation, aiController.generatePlan);
router.get('/plans', aiController.getPlanHistory);
router.get('/plans/:id', aiController.getPlan);
router.post('/budget-recommendations', aiController.generateBudgetRecommendations);
router.post('/investment-advice', investmentAdviceValidation, aiController.generateInvestmentAdvice);

module.exports = router; 