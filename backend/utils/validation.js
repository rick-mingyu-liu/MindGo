const { validationResult } = require('express-validator');
const config = require('../config');
const ErrorHandler = require('./errorHandler');

class ValidationHelper {
  // Check validation results from express-validator
  static checkValidation(req, res) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return ErrorHandler.validationError(res, errors.array());
    }
    return null;
  }

  // Email validation
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  // Password validation
  static isValidPassword(password) {
    return password && password.length >= config.validation.passwordMinLength;
  }

  // Name validation
  static isValidName(name) {
    return name && name.trim().length > 0 && name.length <= config.validation.nameMaxLength;
  }

  // Amount validation
  static isValidAmount(amount) {
    return !isNaN(amount) && parseFloat(amount) > 0;
  }

  // Date validation
  static isValidDate(date) {
    const dateObj = new Date(date);
    return dateObj instanceof Date && !isNaN(dateObj);
  }

  // Stock symbol validation
  static isValidStockSymbol(symbol) {
    return symbol && symbol.trim().length > 0 && symbol.length <= 10;
  }

  // Category validation
  static isValidCategory(category) {
    const validCategories = [
      'Food & Dining',
      'Transportation',
      'Shopping',
      'Entertainment',
      'Healthcare',
      'Housing',
      'Utilities',
      'Insurance',
      'Education',
      'Travel',
      'Business',
      'Personal Care',
      'Gifts',
      'Taxes',
      'Investment',
      'Income',
      'Other'
    ];
    return validCategories.includes(category);
  }

  // Transaction type validation
  static isValidTransactionType(type) {
    return ['income', 'expense'].includes(type);
  }

  // Goal validation
  static isValidGoal(goal) {
    return goal && 
           goal.name && 
           goal.name.trim().length > 0 &&
           goal.target_amount && 
           this.isValidAmount(goal.target_amount) &&
           goal.target_date && 
           this.isValidDate(goal.target_date);
  }

  // Sanitize input
  static sanitizeString(str) {
    if (typeof str !== 'string') return str;
    return str.trim().replace(/[<>]/g, '');
  }

  // Sanitize amount
  static sanitizeAmount(amount) {
    const num = parseFloat(amount);
    return isNaN(num) ? 0 : Math.round(num * 100) / 100;
  }

  // Validate pagination parameters
  static validatePagination(page, limit) {
    const pageNum = parseInt(page) || 1;
    const limitNum = parseInt(limit) || 10;
    
    return {
      page: Math.max(1, pageNum),
      limit: Math.min(100, Math.max(1, limitNum)),
      offset: (pageNum - 1) * limitNum
    };
  }

  // Validate date range
  static validateDateRange(startDate, endDate) {
    const start = startDate ? new Date(startDate) : new Date(new Date().getFullYear(), 0, 1);
    const end = endDate ? new Date(endDate) : new Date();
    
    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      throw new Error('Invalid date format');
    }
    
    if (start > end) {
      throw new Error('Start date cannot be after end date');
    }
    
    return { start, end };
  }
}

module.exports = ValidationHelper; 