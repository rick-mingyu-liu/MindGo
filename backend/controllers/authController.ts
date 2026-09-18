import { Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt, { SignOptions } from 'jsonwebtoken';
import crypto from 'node:crypto';
import { validationResult } from 'express-validator';
import { query } from '../db/connection';
import config = require('../config');
import { maskEmail } from '../utils/privacy';
import { sendWeeklyReport, generateWeeklyReport, sendEmailVerification } from '../services/emailService';
import { validateEmail } from '../services/emailValidationService';

// The columns the SELECT below names — narrower than the full UserRow.
interface ExistingUserRow {
  id: number;
  email: string;
  email_verified: boolean | null;
}

// The columns the INSERT ... RETURNING below names.
interface NewUserRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date | null;
  email_verification_expires: Date | null;
}

// The columns the SELECT below names, for checking a login attempt.
interface LoginUserRow {
  id: number;
  email: string;
  password_hash: string;
  first_name: string;
  last_name: string;
  email_verified: boolean | null;
}

// The columns the SELECT below names, for consuming a verification token.
interface VerifyEmailUserRow {
  id: number;
  email: string;
  first_name: string;
  email_verification_expires: Date | null;
  created_at: Date | null;
}

// The columns the SELECT below names, for resending a verification email.
interface ResendVerificationUserRow {
  id: number;
  email: string;
  first_name: string;
  email_verified: boolean | null;
  email_verification_token: string | null;
  email_verification_expires: Date | null;
}

// The columns the SELECT below names, for a profile response.
interface ProfileRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  created_at: Date | null;
  weekly_reports_enabled: boolean;
  email_notifications_enabled: boolean;
}

// The columns both UPDATE ... RETURNING variants below name.
interface UpdatedProfileRow {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
  language: string;
  updated_at: Date | null;
}

const authController = {
  // Register new user
  async register(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, first_name, last_name } = req.body;

      // MailboxLayer where a key is configured, the disposable-domain list
      // where it is not. Never throws, so it cannot short-circuit the rest of
      // this handler the way it used to.
      const emailValidation = await validateEmail(email);
      if (!emailValidation.valid) {
        console.log(`[Register] Rejected ${maskEmail(email)}: ${emailValidation.reason} (${emailValidation.source})`);
        return res.status(400).json({ error: emailValidation.reason });
      }

      // Check if user already exists
      const existingUser = await query<ExistingUserRow>(
        'SELECT id, email, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        const isVerified = existingUser.rows[0]?.email_verified;
        if (isVerified) {
          console.log(`[Register] Attempt to register an already verified address: ${maskEmail(email)}`);
        } else {
          console.log(`[Register] Attempt to re-register an unverified address: ${maskEmail(email)}`);
        }
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Generate email verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + config.emailVerification.tokenExpiry);

      // Create user with email verification fields
      const newUser = await query<NewUserRow>(
        'INSERT INTO users (email, password_hash, first_name, last_name, email_verification_token, email_verification_expires) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, created_at, email_verification_expires',
        [email, passwordHash, first_name, last_name, verificationToken, verificationExpires]
      );
      // RETURNING always answers with the row just inserted, so rows[0] is
      // never undefined here; the assertions below rely on the same fact.
      const userId = newUser.rows[0]!.id;
      console.log(`[Register] User created:`, {
        id: userId,
        email: maskEmail(email),
        created_at: newUser.rows[0]!.created_at,
        verification_expires: newUser.rows[0]!.email_verification_expires
      });

      // Send verification email
      try {
        // The token is a credential: it verifies the account on its own.
        console.log(`[Register] Sending verification email to user ${userId}`);
        await sendEmailVerification(email, first_name, verificationToken);
      } catch (emailError) {
        // Message and code rather than the whole error. A connection failure
        // carries no address (checked), but nodemailer attaches `envelope` and
        // `rejected` when the SMTP server rejects a recipient, and those hold
        // the address. Precautionary — that path is not reproducible without a
        // real SMTP server — and it reads better in a log either way.
        const code = emailError instanceof Error ? (emailError as Error & { code?: unknown }).code : undefined;
        console.error(`Failed to send verification email for user ${userId}:`, code || (emailError instanceof Error ? emailError.message : undefined));
        // Don't fail registration if email fails, but log it
      }

      res.status(201).json({
        message: 'Registration successful! Please check your email to verify your account.',
        user: newUser.rows[0],
        requiresVerification: true
      });

    } catch (error) {
      console.error('Registration error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Login user
  async login(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await query<LoginUserRow>(
        'SELECT id, email, password_hash, first_name, last_name, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (user.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      // Check password. rows.length === 0 already returned above, so rows[0]
      // exists for the rest of this handler.
      const isValidPassword = await bcrypt.compare(password, user.rows[0]!.password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      // Check if email is verified
      if (!user.rows[0]!.email_verified) {
        return res.status(400).json({
          error: 'Please verify your email address before logging in. Check your inbox for a verification link.',
          requiresVerification: true
        });
      }

      // Generate JWT token
      // config.jwt.secret is typed string | undefined because it is read from
      // the environment, but config/validate.ts exits the process at boot when
      // it is unset, so every request that reaches this handler has one.
      const token = jwt.sign(
        { userId: user.rows[0]!.id, email },
        config.jwt.secret as string,
        // config.jwt.expiresIn is the literal '7d' at its declaration in
        // config/index.ts, which is a valid jsonwebtoken duration string; the
        // cast is only needed because config/index.ts doesn't declare it
        // `as const`, so TypeScript widens the field to plain string.
        { expiresIn: config.jwt.expiresIn as SignOptions['expiresIn'] }
      );

      const { password_hash, email_verified, ...userWithoutPassword } = user.rows[0]!;

      res.json({
        message: 'Login successful',
        user: userWithoutPassword,
        token
      });

    } catch (error) {
      console.error('Login error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Verify email
  async verifyEmail(req: Request, res: Response) {
    try {
      const { token } = req.params;
      console.log('[VerifyEmail] Received verification request'); // token is a credential — not logged
      // Find user with this verification token
      const user = await query<VerifyEmailUserRow>(
        'SELECT id, email, first_name, email_verification_expires, created_at FROM users WHERE email_verification_token = $1',
        [token]
      );
      if (user.rows.length === 0) {
        console.log('[VerifyEmail] No user found for the supplied token');
        // There used to be a fallback here that answered "already verified" by
        // looking up whichever account had verified most recently. Verification
        // clears the token, so a second click on a real link is indistinguishable
        // from a forged one — and that query guessed. On an unauthenticated
        // route it returned a stranger's id, email and first name, which the
        // frontend then displayed. Telling the two apart requires knowing which
        // token was consumed; until the schema records that, this is a 400.
        return res.status(400).json({ error: 'Invalid verification token' });
      }
      // rows.length === 0 already returned above, so rows[0] exists for the
      // rest of this handler.
      const now = new Date();
      // email_verification_expires and created_at can be null; new Date(null)
      // already coerces to the epoch (Number(null) is 0), so ?? 0 reproduces
      // that instead of silently changing what an absent value renders as.
      const expires = new Date(user.rows[0]!.email_verification_expires ?? 0);
      const created = new Date(user.rows[0]!.created_at ?? 0);
      console.log(`[VerifyEmail] User found:`, {
        id: user.rows[0]!.id,
        created_at: created,
        verification_expires: expires,
        now: now
      });
      // Check if token has expired
      if (now > expires) {
        console.log(`[VerifyEmail] Token expired for user ${user.rows[0]!.id}`);
        return res.status(400).json({ error: 'Verification token has expired' });
      }
      // Mark email as verified and clear token
      await query(
        'UPDATE users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = $1',
        [user.rows[0]!.id]
      );
      console.log(`[VerifyEmail] Email verified for user ${user.rows[0]!.id}`);
      res.json({
        message: 'Email verified successfully! You can now log in to your account.',
        user: {
          id: user.rows[0]!.id,
          email: user.rows[0]!.email,
          first_name: user.rows[0]!.first_name
        }
      });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Resend verification email
  async resendVerification(req: Request, res: Response) {
    try {
      const { email } = req.body;

      // Find user
      const user = await query<ResendVerificationUserRow>(
        'SELECT id, email, first_name, email_verified, email_verification_token, email_verification_expires FROM users WHERE email = $1',
        [email]
      );

      if (user.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      // rows.length === 0 already returned above, so rows[0] exists for the
      // rest of this handler.
      if (user.rows[0]!.email_verified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      // Check if previous token is still valid (within the resend cooldown)
      if (user.rows[0]!.email_verification_expires &&
          new Date() < new Date(user.rows[0]!.email_verification_expires) &&
          new Date(user.rows[0]!.email_verification_expires) > new Date(Date.now() - config.emailVerification.resendCooldown)) {
        return res.status(400).json({ error: 'Please wait before requesting another verification email' });
      }

      // Generate new verification token
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + config.emailVerification.tokenExpiry);

      // Update user with new token
      await query(
        'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
        [verificationToken, verificationExpires, user.rows[0]!.id]
      );

      // Send verification email
      try {
        await sendEmailVerification(email, user.rows[0]!.first_name, verificationToken);
        res.json({ message: 'Verification email sent successfully' });
      } catch (emailError) {
        const code = emailError instanceof Error ? (emailError as Error & { code?: unknown }).code : undefined;
        console.error(`Failed to send verification email for user ${user.rows[0]!.id}:`, code || (emailError instanceof Error ? emailError.message : undefined));
        res.status(500).json({ error: 'Failed to send verification email' });
      }

    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get user profile
  async getProfile(req: Request, res: Response) {
    try {
      const user = await query<ProfileRow>(
        'SELECT id, email, first_name, last_name, created_at, weekly_reports_enabled, email_notifications_enabled FROM users WHERE id = $1',
        [req.user.userId]
      );

      if (user.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      res.json({ user: user.rows[0] });

    } catch (error) {
      console.error('Get profile error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update user profile
  async updateProfile(req: Request, res: Response) {
    try {
      const { first_name, last_name, language } = req.body;
      let sql = 'UPDATE users SET first_name = $1, last_name = $2';
      let params = [first_name, last_name, req.user.userId];
      if (language) {
        sql = 'UPDATE users SET first_name = $1, last_name = $2, language = $3 WHERE id = $4 RETURNING id, email, first_name, last_name, language, updated_at';
        params = [first_name, last_name, language, req.user.userId];
      } else {
        sql = 'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 RETURNING id, email, first_name, last_name, language, updated_at';
        params = [first_name, last_name, req.user.userId];
      }
      const updatedUser = await query<UpdatedProfileRow>(sql, params);
      res.json({
        message: 'Profile updated successfully',
        user: updatedUser.rows[0]
      });
    } catch (error) {
      console.error('Update profile error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Send test email
  async sendTestEmail(req: Request, res: Response) {
    try {
      const userEmail = req.user.email;
      const report = await generateWeeklyReport(req.user.userId);
      await sendWeeklyReport(userEmail, report.text, report.html);
      res.json({ message: 'Weekly report test email sent successfully' });
    } catch (error) {
      console.error('Test email error:', error);
      res.status(500).json({ error: 'Failed to send test email' });
    }
  },

  // Update notification settings
  async updateNotificationSettings(req: Request, res: Response) {
    try {
      const { weekly_reports_enabled, email_notifications_enabled } = req.body;
      await query(
        'UPDATE users SET weekly_reports_enabled = $1, email_notifications_enabled = $2 WHERE id = $3',
        [weekly_reports_enabled, email_notifications_enabled, req.user.userId]
      );
      res.json({ message: 'Notification settings updated' });
    } catch (error) {
      console.error('Update notification settings error:', error);
      res.status(500).json({ error: 'Failed to update notification settings' });
    }
  }
};

export = authController;
