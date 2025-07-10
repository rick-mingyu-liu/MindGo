const { validationResult } = require('express-validator');
const db = require('../db/connection');
const { getExchangeRate } = require('../services/exchangeRateService');

const transactionController = {
  // Get all transactions for user
  async getTransactions(req, res) {
    try {
      const { page = 1, limit = 20, type, category, startDate, endDate, targetCurrency } = req.query;
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

      // Currency conversion logic
      const userDefaultCurrency = req.user?.preferences?.currency || 'CAD';
      const displayCurrency = targetCurrency || userDefaultCurrency;
      const rateCache = {};
      async function getRate(from, to) {
        const key = `${from}_${to}`;
        if (rateCache[key]) return rateCache[key];
        const rate = await getExchangeRate(from, to);
        rateCache[key] = rate;
        return rate;
      }
      const convertedTransactions = await Promise.all(transactions.rows.map(async (tx) => {
        let convertedAmount = parseFloat(tx.amount);
        let convertedCurrency = tx.currency || displayCurrency;
        if (tx.currency && tx.currency !== displayCurrency) {
          try {
            const rate = await getRate(tx.currency, displayCurrency);
            convertedAmount = convertedAmount * rate;
            convertedCurrency = displayCurrency;
          } catch (e) {
            // fallback: show original if conversion fails
            convertedAmount = parseFloat(tx.amount);
            convertedCurrency = tx.currency;
          }
        }
        return {
          ...tx,
          convertedAmount,
          convertedCurrency
        };
      }));

      res.json({
        transactions: convertedTransactions,
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

      const { amount, description, category, type, date, currency } = req.body;

      const newTransaction = await db.query(
        'INSERT INTO transactions (user_id, amount, description, category, type, date, currency) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
        [req.user.userId, amount, description, category, type, date, currency]
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
      const { amount, description, category, type, date, currency } = req.body;

      // Check if transaction belongs to user
      const existingTransaction = await db.query(
        'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingTransaction.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const updatedTransaction = await db.query(
        'UPDATE transactions SET amount = $1, description = $2, category = $3, type = $4, date = $5, currency = $6 WHERE id = $7 AND user_id = $8 RETURNING *',
        [amount, description, category, type, date, currency, id, req.user.userId]
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
  },

  // Clear all transactions for user (testing purposes)
  async clearAllTransactions(req, res) {
    try {
      const result = await db.query(
        'DELETE FROM transactions WHERE user_id = $1',
        [req.user.userId]
      );

      res.json({ 
        message: 'All transactions cleared successfully',
        deletedCount: result.rowCount 
      });

    } catch (error) {
      console.error('Clear all transactions error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Auto-delete old transactions
  async autoDeleteOldTransactions(req, res) {
    try {
      const { months = 4 } = req.query;
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(months));

      const result = await db.query(
        'DELETE FROM transactions WHERE user_id = $1 AND date < $2',
        [req.user.userId, cutoffDate.toISOString().split('T')[0]]
      );

      res.json({ 
        message: `Transactions older than ${months} months deleted successfully`,
        deletedCount: result.rowCount,
        cutoffDate: cutoffDate.toISOString().split('T')[0]
      });

    } catch (error) {
      console.error('Auto-delete old transactions error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get data retention settings
  async getDataRetentionSettings(req, res) {
    try {
      // For now, return default settings
      // In a real app, you'd store these in a user_preferences table
      res.json({
        autoDeleteEnabled: false,
        retentionMonths: 4,
        lastCleanup: null
      });

    } catch (error) {
      console.error('Get data retention settings error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update data retention settings
  async updateDataRetentionSettings(req, res) {
    try {
      const { autoDeleteEnabled, retentionMonths } = req.body;

      // Validate retention months
      if (retentionMonths < 1 || retentionMonths > 60) {
        return res.status(400).json({ error: 'Retention months must be between 1 and 60' });
      }

      // In a real app, you'd save these to a user_preferences table
      // For now, just return success
      res.json({
        message: 'Data retention settings updated successfully',
        settings: {
          autoDeleteEnabled: autoDeleteEnabled || false,
          retentionMonths: retentionMonths || 4
        }
      });

    } catch (error) {
      console.error('Update data retention settings error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = transactionController; 