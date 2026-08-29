const logger = require('./logger');
const config = require('../config');

/**
 * Only two of these are mounted: globalErrorHandler and notFoundHandler, both
 * in app.js. The rest are the helpers those two call. Controllers build their
 * own responses rather than going through this class.
 */
class ErrorHandler {
  static unauthorized(res, message = 'Unauthorized') {
    logger.warn(`Unauthorized: ${message}`);
    return res.status(401).json({
      error: message
    });
  }

  static notFound(res, message = 'Resource not found') {
    logger.warn(`Not Found: ${message}`);
    return res.status(404).json({
      error: message
    });
  }

  static validationError(res, errors) {
    logger.warn('Validation Error', errors);
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors
    });
  }

  static serverError(res, error, message = 'Internal server error') {
    logger.error(`Server Error: ${message}`, error);
    return res.status(500).json({
      error: message,
      ...(config.nodeEnv === 'development' && { details: error.message })
    });
  }

  // Global error middleware
  static globalErrorHandler(err, req, res, _next) {
    logger.error('Unhandled Error', err);

    if (err.name === 'ValidationError') {
      return ErrorHandler.validationError(res, err.errors);
    }
    if (err.name === 'JsonWebTokenError') {
      return ErrorHandler.unauthorized(res, 'Invalid token');
    }
    if (err.name === 'TokenExpiredError') {
      return ErrorHandler.unauthorized(res, 'Token expired');
    }
    return ErrorHandler.serverError(res, err);
  }

  // 404 handler
  static notFoundHandler(req, res) {
    return ErrorHandler.notFound(res, 'Route not found');
  }
}

module.exports = ErrorHandler; 