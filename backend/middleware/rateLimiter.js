const rateLimit = require('express-rate-limit');
const config = require('../config');

// General API rate limiter
const apiLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.apiMax,
  message: {
    error: 'Too many requests from this IP, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// Stricter limiter for auth endpoints
const authLimiter = rateLimit({
  windowMs: config.rateLimit.windowMs,
  max: config.rateLimit.authMax,
  message: {
    error: 'Too many authentication attempts, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

// AI endpoints rate limiter
const aiLimiter = rateLimit({
  windowMs: config.rateLimit.aiWindowMs,
  max: config.rateLimit.aiMax,
  message: {
    error: 'Too many AI requests, please try again later.'
  },
  standardHeaders: true,
  legacyHeaders: false,
});

module.exports = {
  apiLimiter,
  authLimiter,
  aiLimiter
}; 