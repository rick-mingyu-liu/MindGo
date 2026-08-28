const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { validationResult } = require('express-validator');
const db = require('../db/connection');
const config = require('../config');
const { maskEmail } = require('../utils/privacy');
const { sendWeeklyReport, generateWeeklyReport, sendEmailVerification } = require('../services/emailService');
const axios = require('axios');

// List of known disposable email domains (partial list - you can expand this).
// Unused: the MailboxLayer call replaced it, but that call hard-fails without
// an API key, so this list is the fallback that would make registration
// degrade instead of 500. See IMPROVEMENTS.md item 13.
// eslint-disable-next-line no-unused-vars
const DISPOSABLE_EMAIL_DOMAINS = [
  '10minutemail.com', 'guerrillamail.com', 'mailinator.com', 'tempmail.org',
  'throwaway.email', 'temp-mail.org', '10minutemail.net', 'mailnesia.com',
  'sharklasers.com', 'getairmail.com', 'getnada.com', 'yopmail.com',
  'trashmail.com', 'maildrop.cc', 'mailinator.net', 'tempmailaddress.com',
  'fakeinbox.com', 'mailmetrash.com', 'spam4.me', 'bccto.me',
  'chacuo.net', 'dispostable.com', 'mailnesia.com', 'mailnull.com',
  'spamspot.com', 'spam.la', 'tempr.email', 'tmpeml.com',
  'tmpmail.net', 'tmpmail.org', 'tmpeml.com', 'tmpbox.net',
  'tmpmail.net', 'tmpmail.org', 'tmpeml.com', 'tmpbox.net',
  'tmpmail.net', 'tmpmail.org', 'tmpeml.com', 'tmpbox.net'
];

// MailboxLayer API validation
async function validateEmailMailboxLayer(email) {
  const apiKey = config.apiKeys.mailboxLayer;
  if (!apiKey) {
    throw new Error('MailboxLayer API key not set');
  }
  const url = `https://apilayer.net/api/check?access_key=${apiKey}&email=${encodeURIComponent(email)}`;
  try {
    const response = await axios.get(url);
    const data = response.data;
    // The full response carries the address back plus everything MailboxLayer
    // inferred about it. Log the verdict, which is what a failed registration
    // actually needs explaining.
    console.log('[MailboxLayer] Checked', maskEmail(email), {
      format_valid: data.format_valid,
      disposable: data.disposable,
      mx_found: data.mx_found,
      smtp_check: data.smtp_check,
    });

    if (!data.format_valid) {
      return { valid: false, reason: 'Invalid email format' };
    }
    if (data.disposable) {
      return { valid: false, reason: 'Disposable email addresses are not allowed' };
    }
    const emailDomain = email.split('@')[1]?.toLowerCase();
    const majorDomains = [
      'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
      '163.com', 'qq.com', 'sina.com', '126.com', '139.com', 'sohu.com'
    ];
    // Loosen MX/SMTP checks for major and Chinese providers
    if ((!data.mx_found || !data.smtp_check) && majorDomains.includes(emailDomain)) {
      return { valid: true };
    }
    if (!data.mx_found) {
      return { valid: false, reason: 'Email domain cannot receive mail' };
    }
    if (!data.smtp_check) {
      return { valid: false, reason: 'Email address is not deliverable' };
    }
    return { valid: true };
  } catch (error) {
    console.error('MailboxLayer API error:', error?.response?.data || error.message || error);
    return { valid: false, reason: 'Email validation service error' };
  }
}

const authController = {
  // Register new user
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, first_name, last_name } = req.body;

      // MailboxLayer email validation
      const emailValidation = await validateEmailMailboxLayer(email);
      if (!emailValidation.valid) {
        return res.status(400).json({ error: emailValidation.reason });
      }

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id, email, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        const isVerified = existingUser.rows[0].email_verified;
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
      const newUser = await db.query(
        'INSERT INTO users (email, password_hash, first_name, last_name, email_verification_token, email_verification_expires) VALUES ($1, $2, $3, $4, $5, $6) RETURNING id, email, first_name, last_name, created_at, email_verification_expires',
        [email, passwordHash, first_name, last_name, verificationToken, verificationExpires]
      );
      const userId = newUser.rows[0].id;
      console.log(`[Register] User created:`, {
        id: userId,
        email: maskEmail(email),
        created_at: newUser.rows[0].created_at,
        verification_expires: newUser.rows[0].email_verification_expires
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
        console.error(`Failed to send verification email for user ${userId}:`, emailError.code || emailError.message);
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
  async login(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password } = req.body;

      // Find user
      const user = await db.query(
        'SELECT id, email, password_hash, first_name, last_name, email_verified FROM users WHERE email = $1',
        [email]
      );

      if (user.rows.length === 0) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      // Check password
      const isValidPassword = await bcrypt.compare(password, user.rows[0].password_hash);
      if (!isValidPassword) {
        return res.status(400).json({ error: 'Invalid credentials' });
      }

      // Check if email is verified
      if (!user.rows[0].email_verified) {
        return res.status(400).json({ 
          error: 'Please verify your email address before logging in. Check your inbox for a verification link.',
          requiresVerification: true 
        });
      }

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.rows[0].id, email },
        config.jwt.secret,
        { expiresIn: config.jwt.expiresIn }
      );

      const { password_hash, email_verified, ...userWithoutPassword } = user.rows[0];

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
  async verifyEmail(req, res) {
    try {
      const { token } = req.params;
      console.log('[VerifyEmail] Received verification request'); // token is a credential — not logged
      // Find user with this verification token
      const user = await db.query(
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
      const now = new Date();
      const expires = new Date(user.rows[0].email_verification_expires);
      const created = new Date(user.rows[0].created_at);
      console.log(`[VerifyEmail] User found:`, {
        id: user.rows[0].id,
        created_at: created,
        verification_expires: expires,
        now: now
      });
      // Check if token has expired
      if (now > expires) {
        console.log(`[VerifyEmail] Token expired for user ${user.rows[0].id}`);
        return res.status(400).json({ error: 'Verification token has expired' });
      }
      // Mark email as verified and clear token
      await db.query(
        'UPDATE users SET email_verified = TRUE, email_verification_token = NULL, email_verification_expires = NULL WHERE id = $1',
        [user.rows[0].id]
      );
      console.log(`[VerifyEmail] Email verified for user ${user.rows[0].id}`);
      res.json({
        message: 'Email verified successfully! You can now log in to your account.',
        user: {
          id: user.rows[0].id,
          email: user.rows[0].email,
          first_name: user.rows[0].first_name
        }
      });
    } catch (error) {
      console.error('Email verification error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Resend verification email
  async resendVerification(req, res) {
    try {
      const { email } = req.body;

      // Find user
      const user = await db.query(
        'SELECT id, email, first_name, email_verified, email_verification_token, email_verification_expires FROM users WHERE email = $1',
        [email]
      );

      if (user.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }

      if (user.rows[0].email_verified) {
        return res.status(400).json({ error: 'Email is already verified' });
      }

      // Check if previous token is still valid (within the resend cooldown)
      if (user.rows[0].email_verification_expires && 
          new Date() < new Date(user.rows[0].email_verification_expires) &&
          new Date(user.rows[0].email_verification_expires) > new Date(Date.now() - config.emailVerification.resendCooldown)) {
        return res.status(400).json({ error: 'Please wait before requesting another verification email' });
      }

      // Generate new verification token
      const crypto = require('crypto');
      const verificationToken = crypto.randomBytes(32).toString('hex');
      const verificationExpires = new Date(Date.now() + config.emailVerification.tokenExpiry);

      // Update user with new token
      await db.query(
        'UPDATE users SET email_verification_token = $1, email_verification_expires = $2 WHERE id = $3',
        [verificationToken, verificationExpires, user.rows[0].id]
      );

      // Send verification email
      try {
        await sendEmailVerification(email, user.rows[0].first_name, verificationToken);
        res.json({ message: 'Verification email sent successfully' });
      } catch (emailError) {
        console.error(`Failed to send verification email for user ${user.rows[0].id}:`, emailError.code || emailError.message);
        res.status(500).json({ error: 'Failed to send verification email' });
      }

    } catch (error) {
      console.error('Resend verification error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get user profile
  async getProfile(req, res) {
    try {
      const user = await db.query(
        'SELECT id, email, first_name, last_name, created_at FROM users WHERE id = $1',
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
  async updateProfile(req, res) {
    try {
      const { first_name, last_name, language } = req.body;
      let query = 'UPDATE users SET first_name = $1, last_name = $2';
      let params = [first_name, last_name, req.user.userId];
      if (language) {
        query = 'UPDATE users SET first_name = $1, last_name = $2, language = $3 WHERE id = $4 RETURNING id, email, first_name, last_name, language, updated_at';
        params = [first_name, last_name, language, req.user.userId];
      } else {
        query = 'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 RETURNING id, email, first_name, last_name, language, updated_at';
        params = [first_name, last_name, req.user.userId];
      }
      const updatedUser = await db.query(query, params);
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
  async sendTestEmail(req, res) {
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
  async updateNotificationSettings(req, res) {
    try {
      const { weekly_reports_enabled, email_notifications_enabled } = req.body;
      await db.query(
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

// Helper function to create sample data for new users
// Never called — new accounts get no starter data. Unclear whether that is a
// removed feature or a lost wiring; see IMPROVEMENTS.md item 13.
// eslint-disable-next-line no-unused-vars
async function createSampleDataForNewUser(userId) {
  try {
    const currentDate = new Date();
    const currentMonth = currentDate.getMonth();
    const currentYear = currentDate.getFullYear();

    // Create sample transactions for the current month and previous months
    const sampleTransactions = [
      // Sample income - current month
      {
        amount: 5000.00,
        description: 'Sample Salary Payment',
        category: 'Salary',
        type: 'income',
        date: new Date(currentYear, currentMonth, 15).toISOString().split('T')[0]
      },
      {
        amount: 300.00,
        description: 'Sample Freelance Income',
        category: 'Freelance',
        type: 'income',
        date: new Date(currentYear, currentMonth, 20).toISOString().split('T')[0]
      },
      // Sample expenses - current month
      {
        amount: 1200.00,
        description: 'Sample Rent Payment',
        category: 'Housing',
        type: 'expense',
        date: new Date(currentYear, currentMonth, 1).toISOString().split('T')[0]
      },
      {
        amount: 400.00,
        description: 'Sample Grocery Shopping',
        category: 'Groceries',
        type: 'expense',
        date: new Date(currentYear, currentMonth, 5).toISOString().split('T')[0]
      },
      {
        amount: 150.00,
        description: 'Sample Utility Bill',
        category: 'Utilities',
        type: 'expense',
        date: new Date(currentYear, currentMonth, 10).toISOString().split('T')[0]
      },
      {
        amount: 200.00,
        description: 'Sample Transportation',
        category: 'Transportation',
        type: 'expense',
        date: new Date(currentYear, currentMonth, 12).toISOString().split('T')[0]
      },
      // Add some data from previous months to ensure it shows in summary
      {
        amount: 5000.00,
        description: 'Sample Previous Month Salary',
        category: 'Salary',
        type: 'income',
        date: new Date(currentYear, currentMonth - 1, 15).toISOString().split('T')[0]
      },
      {
        amount: 1200.00,
        description: 'Sample Previous Month Rent',
        category: 'Housing',
        type: 'expense',
        date: new Date(currentYear, currentMonth - 1, 1).toISOString().split('T')[0]
      }
    ];

    // Insert sample transactions
    for (const transaction of sampleTransactions) {
      await db.query(
        'INSERT INTO transactions (user_id, amount, description, category, type, date, currency) VALUES ($1, $2, $3, $4, $5, $6, $7)',
        [userId, transaction.amount, transaction.description, transaction.category, transaction.type, transaction.date, 'CAD']
      );
    }

    // Create sample savings goal
    await db.query(
      'INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, description) VALUES ($1, $2, $3, $4, $5, $6)',
      [userId, 'Emergency Fund', 10000.00, 500.00, new Date(currentYear + 1, currentMonth, 31).toISOString().split('T')[0], 'Build emergency fund to cover 6 months of expenses']
    );

    // Create sample watchlist items
    const sampleStocks = [
      ['AAPL', 'Apple Inc.'],
      ['GOOGL', 'Alphabet Inc.'],
      ['MSFT', 'Microsoft Corporation']
    ];

    for (const [symbol, company] of sampleStocks) {
      await db.query(
        'INSERT INTO watchlist (user_id, symbol, company_name) VALUES ($1, $2, $3)',
        [userId, symbol, company]
      );
    }

    console.log(`Sample data created for user ${userId}`);
  } catch (error) {
    console.error('Error creating sample data:', error);
    // Don't fail registration if sample data creation fails
  }
}

module.exports = authController; 