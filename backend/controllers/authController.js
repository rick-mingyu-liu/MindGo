const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../db/connection');
const { sendWeeklyReport, generateWeeklyReport } = require('../services/emailService');

const authController = {
  // Register new user
  async register(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { email, password, first_name, last_name } = req.body;

      // Check if user already exists
      const existingUser = await db.query(
        'SELECT id FROM users WHERE email = $1',
        [email]
      );

      if (existingUser.rows.length > 0) {
        return res.status(400).json({ error: 'User already exists' });
      }

      // Hash password
      const saltRounds = 10;
      const passwordHash = await bcrypt.hash(password, saltRounds);

      // Create user
      const newUser = await db.query(
        'INSERT INTO users (email, password_hash, first_name, last_name) VALUES ($1, $2, $3, $4) RETURNING id, email, first_name, last_name, created_at',
        [email, passwordHash, first_name, last_name]
      );

      const userId = newUser.rows[0].id;

      // Create sample data for new user
      await createSampleDataForNewUser(userId);

      // Generate JWT token
      const token = jwt.sign(
        { userId: newUser.rows[0].id, email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      res.status(201).json({
        message: 'User registered successfully',
        user: newUser.rows[0],
        token
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
        'SELECT id, email, password_hash, first_name, last_name FROM users WHERE email = $1',
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

      // Generate JWT token
      const token = jwt.sign(
        { userId: user.rows[0].id, email },
        process.env.JWT_SECRET,
        { expiresIn: '7d' }
      );

      const { password_hash, ...userWithoutPassword } = user.rows[0];

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
      const { first_name, last_name } = req.body;

      const updatedUser = await db.query(
        'UPDATE users SET first_name = $1, last_name = $2 WHERE id = $3 RETURNING id, email, first_name, last_name, updated_at',
        [first_name, last_name, req.user.userId]
      );

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
  }
};

// Helper function to create sample data for new users
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
        category: 'Food & Dining',
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
        'INSERT INTO transactions (user_id, amount, description, category, type, date) VALUES ($1, $2, $3, $4, $5, $6)',
        [userId, transaction.amount, transaction.description, transaction.category, transaction.type, transaction.date]
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