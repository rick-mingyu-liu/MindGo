import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import config = require('../config');
import type { AuthUser } from '../types/express';

const auth = (req: Request, res: Response, next: NextFunction) => {
  try {
    const token = req.header('Authorization')?.replace('Bearer ', '');

    if (!token) {
      return res.status(401).json({ error: 'Access denied. No token provided.' });
    }

    // config.jwt.secret is typed string | undefined because it is read from
    // the environment, but config/validate.ts exits the process at boot when
    // it is unset, so every request that reaches this middleware has one.
    const decoded = jwt.verify(token, config.jwt.secret as string);

    // jwt.verify returns string | JwtPayload; authController only ever signs
    // { userId: number, email: string }, but a validly-signed token with a
    // different shape must not sail through and blow up in a controller.
    if (
      typeof decoded !== 'object' ||
      decoded === null ||
      typeof (decoded as Record<string, unknown>).userId !== 'number' ||
      typeof (decoded as Record<string, unknown>).email !== 'string'
    ) {
      return res.status(401).json({ error: 'Invalid token.' });
    }

    req.user = decoded as AuthUser;
    next();
  } catch (error) {
    res.status(401).json({ error: 'Invalid token.' });
  }
};

export = auth;
