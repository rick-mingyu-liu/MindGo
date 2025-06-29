const { validationResult } = require('express-validator');
const db = require('../db/connection');

const transactionController = {
  // Get all transactions for user
  async getTransactions(req, res) {
    try {
      const { page = 1, limit = 20, type, category, startDate, endDate } = req.query;
      const offset = (page - 1) * limit;

      let query = 'SELECT * FROM transactions WHERE user_id = $1';
      const params = [req.user.userId];
      let paramCount = 1;

      // Add filters
      if (type) {
        paramCount++;
        query += ` AND type = $${paramCount}`;
        params.push(type);
      }

      if (category) {
        paramCount++;
        query += ` AND category = $${paramCount}`;
        params.push(category);
      }

      if (startDate) {
        paramCount++;
        query += ` AND date >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        query += ` AND date <= $${paramCount}`;
        params.push(endDate);
      }

      // Add ordering and pagination
      query += ` ORDER BY date DESC, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit), offset);

      const transactions = await db.query(query, params);

      // Get total count for pagination
      let countQuery = 'SELECT COUNT(*) FROM transactions WHERE user_id = $1';
      const countParams = [req.user.userId];
      let countParamCount = 1;

      if (type) {
        countParamCount++;
        countQuery += ` AND type = $${countParamCount}`;
        countParams.push(type);
      }

      if (category) {
        countParamCount++;
        countQuery += ` AND category = $${countParamCount}`;
        countParams.push(category);
      }

      if (startDate) {
        countParamCount++;
        countQuery += ` AND date >= $${countParamCount}`;
        countParams.push(startDate);
      }

      if (endDate) {
        countParamCount++;
        countQuery += ` AND date <= $${countParamCount}`;
        countParams.push(endDate);
      }

      const countResult = await db.query(countQuery, countParams);
      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        transactions: transactions.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      });

    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Create new transaction
  async createTransaction(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { amount, description, category, type, date } = req.body;

      const newTransaction = await db.query(
        'INSERT INTO transactions (user_id, amount, description, category, type, date) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [req.user.userId, amount, description, category, type, date]
      );

      res.status(201).json({
        message: 'Transaction created successfully',
        transaction: newTransaction.rows[0]
      });

    } catch (error) {
      console.error('Create transaction error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update transaction
  async updateTransaction(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { amount, description, category, type, date } = req.body;

      // Check if transaction belongs to user
      const existingTransaction = await db.query(
        'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingTransaction.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const updatedTransaction = await db.query(
        'UPDATE transactions SET amount = $1, description = $2, category = $3, type = $4, date = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
        [amount, description, category, type, date, id, req.user.userId]
      );

      res.json({
        message: 'Transaction updated successfully',
        transaction: updatedTransaction.rows[0]
      });

    } catch (error) {
      console.error('Update transaction error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Delete transaction
  async deleteTransaction(req, res) {
    try {
      const { id } = req.params;

      // Check if transaction belongs to user
      const existingTransaction = await db.query(
        'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingTransaction.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      await db.query(
        'DELETE FROM transactions WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      res.json({ message: 'Transaction deleted successfully' });

    } catch (error) {
      console.error('Delete transaction error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get transaction categories
  async getCategories(req, res) {
    try {
      const categories = await db.query(
        'SELECT DISTINCT category FROM transactions WHERE user_id = $1 ORDER BY category',
        [req.user.userId]
      );

      res.json({ categories: categories.rows.map(row => row.category) });

    } catch (error) {
      console.error('Get categories error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = transactionController; 