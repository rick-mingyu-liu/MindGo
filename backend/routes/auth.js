const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');

const router = express.Router();

// Enhanced email validation function
const validateEmail = (email) => {
  // Basic format check
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(email)) {
    return false;
  }
  
  // Check for common invalid patterns
  const invalidPatterns = [
    /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/, // Valid format
    /^[^@]+@[^@]+\.[^@]+$/, // Has @ and domain
  ];
  
  // Additional checks
  if (email.length > 254) return false; // RFC 5321 limit
  if (email.split('@')[0].length > 64) return false; // Local part limit
  if (email.includes('..')) return false; // No consecutive dots
  if (email.startsWith('.') || email.endsWith('.')) return false; // No leading/trailing dots
  if (email.includes('@.') || email.includes('.@')) return false; // No @ next to dots
  
  return true;
};

// Validation middleware
const registerValidation = [
  body('email')
    .isEmail().withMessage('Please enter a valid email')
    .custom((value) => {
      if (!validateEmail(value)) {
        throw new Error('Invalid email format');
      }
      return true;
    })
    .normalizeEmail(),
  body('password').isLength({ min: 6 }).withMessage('Password must be at least 6 characters long'),
  body('first_name').notEmpty().withMessage('First name is required'),
  body('last_name').notEmpty().withMessage('Last name is required')
];

const loginValidation = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('first_name').notEmpty().withMessage('First name is required'),
  body('last_name').notEmpty().withMessage('Last name is required')
];

const resendVerificationValidation = [
  body('email').isEmail().withMessage('Please enter a valid email')
];

// Routes
router.post('/register', registerValidation, authController.register);
router.post('/login', loginValidation, authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', resendVerificationValidation, authController.resendVerification);
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, updateProfileValidation, authController.updateProfile);
router.post('/test-email', auth, authController.sendTestEmail);
router.put('/notifications', auth, authController.updateNotificationSettings);

module.exports = router; 