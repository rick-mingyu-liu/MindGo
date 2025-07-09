const logger = require('./logger');

class ErrorHandler {
  // Standard error responses
  static badRequest(res, message = 'Bad request', details = null) {
    logger.warn(`Bad Request: ${message}`, details);
    return res.status(400).json({
      error: message,
      details: details
    });
  }

  static unauthorized(res, message = 'Unauthorized') {
    logger.warn(`Unauthorized: ${message}`);
    return res.status(401).json({
      error: message
    });
  }

  static forbidden(res, message = 'Forbidden') {
    logger.warn(`Forbidden: ${message}`);
    return res.status(403).json({
      error: message
    });
  }

  static notFound(res, message = 'Resource not found') {
    logger.warn(`Not Found: ${message}`);
    return res.status(404).json({
      error: message
    });
  }

  static conflict(res, message = 'Resource conflict') {
    logger.warn(`Conflict: ${message}`);
    return res.status(409).json({
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
      ...(process.env.NODE_ENV === 'development' && { details: error.message })
    });
  }

  // Database error handling
  static databaseError(res, error) {
    logger.error('Database Error', error);
    
    if (error.code === '23505') { // Unique constraint violation
      return this.conflict(res, 'Resource already exists');
    }
    
    if (error.code === '23503') { // Foreign key violation
      return this.badRequest(res, 'Referenced resource does not exist');
    }
    
    return this.serverError(res, error, 'Database operation failed');
  }

  // Async error wrapper
  static asyncHandler(fn) {
    return (req, res, next) => {
      Promise.resolve(fn(req, res, next)).catch(next);
    };
  }

  // Global error middleware
  static globalErrorHandler(err, req, res, next) {
    logger.error('Unhandled Error', err);
    
    // Handle specific error types
    if (err.name === 'ValidationError') {
      return this.validationError(res, err.errors);
    }
    
    if (err.name === 'JsonWebTokenError') {
      return this.unauthorized(res, 'Invalid token');
    }
    
    if (err.name === 'TokenExpiredError') {
      return this.unauthorized(res, 'Token expired');
    }
    
    // Default server error
    return this.serverError(res, err);
  }

  // 404 handler
  static notFoundHandler(req, res) {
    return this.notFound(res, 'Route not found');
  }
}

module.exports = ErrorHandler; 