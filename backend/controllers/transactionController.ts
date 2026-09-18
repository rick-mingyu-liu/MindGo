import { Request, Response } from 'express';
import { validationResult, FieldValidationError } from 'express-validator';
import { query } from '../db/connection';
import { getExchangeRate } from '../services/exchangeRateService';
import type { TransactionRow } from '../types/db';
import { errorSummary } from '../utils/errorSummary';

/** A transactions row, plus its amount converted to the caller's requested currency. */
interface TransactionWithConversion extends TransactionRow {
  convertedAmount: number;
  convertedCurrency: string;
}

/** The one column COUNT(*) selects below. */
interface CountRow {
  count: string;
}

/** One row of req.body.rows, as importValidation (routes/transactions.ts) validates it. */
interface ImportRow {
  amount: string;
  description: string;
  category: string;
  type: string;
  date: string;
  currency: string;
  source: string;
  edited: boolean;
}

const transactionController = {
  // Get all transactions for user
  async getTransactions(req: Request, res: Response) {
    try {
      // No express-validator chain runs on this route, so these are read
      // exactly as the original code read them off req.query: untyped
      // strings when present, with page/limit defaulting only on undefined,
      // matching a destructuring default's own behaviour. page/limit stay
      // the raw strings (parsed only at the specific sites below that
      // originally parsed them) -- '-' and '*' already coerce with ToNumber,
      // which is what Number() does and parseInt() does not: parsing here
      // would silently floor a fractional page/limit before offset is
      // computed, turning '?page=5.7&limit=3' from OFFSET 14.1 into OFFSET 12.
      const page = (req.query.page as string | undefined) ?? '1';
      const limit = (req.query.limit as string | undefined) ?? '50';
      const type = req.query.type as string | undefined;
      const category = req.query.category as string | undefined;
      const startDate = req.query.startDate as string | undefined;
      const endDate = req.query.endDate as string | undefined;
      const targetCurrency = req.query.targetCurrency as string | undefined;
      const offset = (Number(page) - 1) * Number(limit);

      let sql = 'SELECT * FROM transactions WHERE user_id = $1';
      const params: unknown[] = [req.user.userId];
      let paramCount = 1;

      // Add filters
      if (type) {
        paramCount++;
        sql += ` AND type = $${paramCount}`;
        params.push(type);
      }

      if (category) {
        paramCount++;
        sql += ` AND category = $${paramCount}`;
        params.push(category);
      }

      if (startDate) {
        paramCount++;
        sql += ` AND date >= $${paramCount}`;
        params.push(startDate);
      }

      if (endDate) {
        paramCount++;
        sql += ` AND date <= $${paramCount}`;
        params.push(endDate);
      }

      // Add ordering and pagination
      sql += ` ORDER BY date DESC, created_at DESC LIMIT $${paramCount + 1} OFFSET $${paramCount + 2}`;
      params.push(parseInt(limit), offset);

      const transactions = await query<TransactionRow>(sql, params);

      // Get total count for pagination
      let countSql = 'SELECT COUNT(*) FROM transactions WHERE user_id = $1';
      const countParams: unknown[] = [req.user.userId];
      let countParamCount = 1;

      if (type) {
        countParamCount++;
        countSql += ` AND type = $${countParamCount}`;
        countParams.push(type);
      }

      if (category) {
        countParamCount++;
        countSql += ` AND category = $${countParamCount}`;
        countParams.push(category);
      }

      if (startDate) {
        countParamCount++;
        countSql += ` AND date >= $${countParamCount}`;
        countParams.push(startDate);
      }

      if (endDate) {
        countParamCount++;
        countSql += ` AND date <= $${countParamCount}`;
        countParams.push(endDate);
      }

      const countResult = await query<CountRow>(countSql, countParams);
      // COUNT(*) with no GROUP BY always returns exactly one row.
      const totalCount = parseInt(countResult.rows[0]!.count);

      // Currency conversion logic. req.user never carries a `preferences`
      // field (see types/express.d.ts) -- the JWT authController signs holds
      // only userId and email -- so this always evaluated to 'CAD' in the
      // original JS too.
      const userDefaultCurrency = 'CAD';
      const displayCurrency = targetCurrency || userDefaultCurrency;
      const rateCache: Record<string, number> = {};
      async function getRate(from: string, to: string): Promise<number> {
        const key = `${from}_${to}`;
        if (rateCache[key]) return rateCache[key];
        const rate = await getExchangeRate(from, to);
        rateCache[key] = rate;
        return rate;
      }
      const convertedTransactions: TransactionWithConversion[] = await Promise.all(transactions.rows.map(async (tx): Promise<TransactionWithConversion> => {
        let convertedAmount = parseFloat(tx.amount);
        let convertedCurrency = tx.currency || displayCurrency;
        if (tx.currency && tx.currency !== displayCurrency) {
          try {
            const rate = await getRate(tx.currency, displayCurrency);
            convertedAmount = convertedAmount * rate;
            convertedCurrency = displayCurrency;
          } catch (_e) {
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
          pages: Math.ceil(totalCount / Number(limit))
        }
      });

    } catch (error) {
      console.error('Get transactions error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Create new transaction
  async createTransaction(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { amount, description, category, type, date, currency } = req.body;

      const newTransaction = await query<TransactionRow>(
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

  // Save the rows a user confirmed on the screenshot import screen
  async importTransactions(req: Request, res: Response) {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      // This file only ever validates with body()/query() chains, never
      // oneOf() or checkSchema(), so every error here is a field error and
      // carries .path -- the wider ValidationError union express-validator's
      // .array() returns doesn't reflect that.
      const list = errors.array() as FieldValidationError[];
      const invalidRows = [...new Set(list
        .map((e) => /^rows\[(\d+)\]/.exec(e.path))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => Number(m[1])))].sort((a, b) => a - b);
      return res.status(400).json({ errors: list.map(({ path, msg }) => ({ path, msg })), invalidRows });
    }

    try {
      const userId = req.user.userId;
      // req.body is `any`; importValidation (routes/transactions.ts) has
      // already checked this exact shape by the time this handler runs,
      // since the early return above happens when validation fails.
      const { rows } = req.body as { rows: ImportRow[] };

      const params: unknown[] = [];
      const tuples = rows.map((row) => {
        const first = params.length + 1;
        params.push(userId, row.amount, row.description, row.category, row.type, row.date, row.currency, row.source);
        return `(${Array.from({ length: 8 }, (_, i) => `$${first + i}`).join(', ')})`;
      });
      const batch = params.length + 1;
      params.push(
        userId,
        rows.length,
        rows.filter((row) => row.edited).length,
        rows.filter((row) => row.source === 'ocr_llm').length
      );

      // One statement: every row and the batch record are written together or
      // not at all. A data-modifying CTE runs whether or not the outer query
      // reads it.
      const result = await query<{ id: number }>(
        `WITH inserted AS (
           INSERT INTO transactions (user_id, amount, description, category, type, date, currency, source)
           VALUES ${tuples.join(', ')}
           RETURNING id
         ), batch AS (
           INSERT INTO import_batches (user_id, row_count, edited_count, llm_count)
           VALUES ($${batch}, $${batch + 1}, $${batch + 2}, $${batch + 3})
         )
         SELECT id FROM inserted`,
        params
      );

      res.status(201).json({
        message: 'Transactions imported successfully',
        ids: result.rows.map((row) => row.id),
      });
    } catch (error) {
      // Name and code only: a database error can quote the value it rejected.
      console.error('Import transactions error:', { userId: req.user.userId, ...errorSummary(error) });
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update transaction
  async updateTransaction(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { amount, description, category, type, date, currency } = req.body;

      // Check if transaction belongs to user
      const existingTransaction = await query<{ id: number }>(
        'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingTransaction.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      const updatedTransaction = await query<TransactionRow>(
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
  async deleteTransaction(req: Request, res: Response) {
    try {
      const { id } = req.params;

      // Check if transaction belongs to user
      const existingTransaction = await query<{ id: number }>(
        'SELECT id FROM transactions WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingTransaction.rows.length === 0) {
        return res.status(404).json({ error: 'Transaction not found' });
      }

      await query(
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
  async getCategories(req: Request, res: Response) {
    try {
      const categories = await query<{ category: string }>(
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
  async clearAllTransactions(req: Request, res: Response) {
    try {
      const result = await query(
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
  async autoDeleteOldTransactions(req: Request, res: Response) {
    try {
      // This deletes rows and cannot be undone, so the validator runs before
      // anything else -- see the note on autoDeleteValidation in the route file.
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const months = (req.query.months as string | undefined) ?? 4;
      const cutoffDate = new Date();
      cutoffDate.setMonth(cutoffDate.getMonth() - parseInt(String(months)));

      const result = await query(
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
  async getDataRetentionSettings(_req: Request, res: Response) {
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
  async updateDataRetentionSettings(req: Request, res: Response) {
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

export = transactionController;
