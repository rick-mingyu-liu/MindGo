import type { NextFunction, Request, Response } from 'express';
import logger = require('./logger');
import config = require('../config');

/**
 * Only two of these are mounted: globalErrorHandler and notFoundHandler, both
 * in app.ts. The rest are the helpers those two call. Controllers build their
 * own responses rather than going through this class.
 */
class ErrorHandler {
  static unauthorized(res: Response, message: string = 'Unauthorized'): Response {
    logger.warn(`Unauthorized: ${message}`);
    return res.status(401).json({
      error: message
    });
  }

  static notFound(res: Response, message: string = 'Resource not found'): Response {
    logger.warn(`Not Found: ${message}`);
    return res.status(404).json({
      error: message
    });
  }

  static validationError(res: Response, errors: unknown): Response {
    logger.warn('Validation Error', errors);
    return res.status(400).json({
      error: 'Validation failed',
      errors: errors
    });
  }

  static serverError(res: Response, error: unknown, message: string = 'Internal server error'): Response {
    logger.error(`Server Error: ${message}`, error);
    return res.status(500).json({
      error: message,
      ...(config.nodeEnv === 'development' && { details: error instanceof Error ? error.message : undefined })
    });
  }

  // Global error middleware
  static globalErrorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction): Response {
    logger.error('Unhandled Error', err);

    if (err instanceof Error) {
      if (err.name === 'ValidationError') {
        return ErrorHandler.validationError(res, 'errors' in err ? err.errors : undefined);
      }
      if (err.name === 'JsonWebTokenError') {
        return ErrorHandler.unauthorized(res, 'Invalid token');
      }
      if (err.name === 'TokenExpiredError') {
        return ErrorHandler.unauthorized(res, 'Token expired');
      }
    }
    return ErrorHandler.serverError(res, err);
  }

  // 404 handler
  static notFoundHandler(_req: Request, res: Response): Response {
    return ErrorHandler.notFound(res, 'Route not found');
  }
}

export = ErrorHandler;
