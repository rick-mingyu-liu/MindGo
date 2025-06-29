const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { validationResult } = require('express-validator');
const db = require('../db/connection');

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
  }
};

module.exports = authController; 