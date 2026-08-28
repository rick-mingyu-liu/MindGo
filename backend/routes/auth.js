const express = require('express');
const { body } = require('express-validator');
const authController = require('../controllers/authController');
const auth = require('../middleware/auth');
const config = require('../config');
const { authLimiter } = require('../middleware/rateLimiter');

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
  if (email.length > config.validation.emailMaxLength) return false; // RFC 5321 limit
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
  body('password')
    .isLength({ min: config.validation.passwordMinLength })
    .withMessage(`Password must be at least ${config.validation.passwordMinLength} characters long`),
  body('first_name')
    .notEmpty().withMessage('First name is required')
    .isLength({ max: config.validation.nameMaxLength })
    .withMessage(`First name must be at most ${config.validation.nameMaxLength} characters`),
  body('last_name')
    .notEmpty().withMessage('Last name is required')
    .isLength({ max: config.validation.nameMaxLength })
    .withMessage(`Last name must be at most ${config.validation.nameMaxLength} characters`)
];

const loginValidation = [
  body('email').isEmail().withMessage('Please enter a valid email'),
  body('password').notEmpty().withMessage('Password is required')
];

const updateProfileValidation = [
  body('first_name')
    .notEmpty().withMessage('First name is required')
    .isLength({ max: config.validation.nameMaxLength })
    .withMessage(`First name must be at most ${config.validation.nameMaxLength} characters`),
  body('last_name')
    .notEmpty().withMessage('Last name is required')
    .isLength({ max: config.validation.nameMaxLength })
    .withMessage(`Last name must be at most ${config.validation.nameMaxLength} characters`)
];

const resendVerificationValidation = [
  body('email').isEmail().withMessage('Please enter a valid email')
];

// Routes
//
// authLimiter (5 per 15 min) is applied per-route rather than to the whole
// router. The endpoints below that guess credentials or send mail are the ones
// worth throttling that hard; /profile and /notifications are ordinary
// authenticated traffic, and a user editing their settings can legitimately
// save more than five times in a quarter hour. Those fall under the general
// apiLimiter in app.js instead.
router.post('/register', authLimiter, registerValidation, authController.register);
router.post('/login', authLimiter, loginValidation, authController.login);
router.get('/verify-email/:token', authController.verifyEmail);
router.post('/resend-verification', authLimiter, resendVerificationValidation, authController.resendVerification);
router.get('/profile', auth, authController.getProfile);
router.put('/profile', auth, updateProfileValidation, authController.updateProfile);
// Sends an email, so it is throttled like the credential routes.
router.post('/test-email', authLimiter, auth, authController.sendTestEmail);
router.put('/notifications', auth, authController.updateNotificationSettings);

module.exports = router; 