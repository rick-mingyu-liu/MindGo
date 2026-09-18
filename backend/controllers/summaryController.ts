import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../db/connection';
import { getExchangeRate } from '../services/exchangeRateService';
import {
  boundsOf, labelOf, currentTerm, previousTerm,
  yearBoundsOf, yearLabelOf, currentYear, previousYear,
} from '../utils/terms';
import { monthOf } from '../utils/dates';
import type { TransactionRow, TransactionType } from '../types/db';

/** `(2026, 4, 1)` -> `'2026-05-01'`. month is 0-based, as in `Date`. */
const isoDate = (year: number, month: number, day: number): string =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

/** A transactions row, plus its amount converted to the caller's requested currency. */
interface TransactionWithConversion extends TransactionRow {
  convertedAmount: number;
  convertedCurrency: string;
}

/** getMonthlySummary's per-category totals, keyed by category name. */
interface MonthlyCategoryTotals {
  income: number;
  expenses: number;
  transactions: TransactionWithConversion[];
}

/** getRollingSummary's per-category totals, keyed by category name. */
interface RollingCategoryTotals {
  total: number;
  count: number;
  average: number;
}

/** getRollingSummary's chosen window: a term, a year, or a rolling month count. */
interface RollingWindow {
  start: string;
  end: string;
  term: string | null;
  year: string | null;
  label: string | null;
  period: string;
}

/** getRollingSummary's per-month breakdown, keyed by 'YYYY-MM'. */
interface MonthlyBreakdownEntry {
  month: string;
  income: number;
  expenses: number;
  netIncome: number;
  transactions: TransactionWithConversion[];
}

// The columns this aggregate SELECT names. EXTRACT, SUM and COUNT all return
// Postgres numeric/bigint, which node-pg returns as strings by default to
// avoid precision loss — never parsed here as JS numbers.
interface TrendRow {
  year: string;
  month: string;
  category: string;
  type: TransactionType;
  total_amount: string;
  transaction_count: string;
}

/** getSpendingTrends's per-month breakdown, keyed by 'YYYY-MM'. */
interface TrendMonth {
  month: string;
  categories: Record<string, { income: number; expenses: number; transactionCount: number }>;
  totalIncome: number;
  totalExpenses: number;
}

const summaryController = {
  // Get monthly summary
  async getMonthlySummary(req: Request, res: Response) {
    try {
      // getMonthlySummary has no express-validator chain (unlike /rolling), so
      // these are read exactly as the original code read them off req.query:
      // untyped strings when present.
      const year = req.query.year as string | undefined;
      const month = req.query.month as string | undefined;
      const targetCurrency = (req.query.targetCurrency as string | undefined) ?? 'CAD';
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetMonth = month || currentDate.getMonth() + 1;

      // Get transactions for the specified month
      const transactions = await query<TransactionRow>(
        `SELECT * FROM transactions
         WHERE user_id = $1
         AND EXTRACT(YEAR FROM date) = $2
         AND EXTRACT(MONTH FROM date) = $3
         ORDER BY date DESC`,
        [req.user.userId, targetYear, targetMonth]
      );

      // Prepare for conversion
      const txs = transactions.rows;
      const convertedTxs: TransactionWithConversion[] = [];
      let totalIncome = 0;
      let totalExpenses = 0;
      let netIncome = 0;
      const categories: Record<string, MonthlyCategoryTotals> = {};

      // Cache for rates in this request
      const rateCache: Record<string, number> = {};
      async function getRate(from: string, to: string): Promise<number> {
        const key = `${from}_${to}`;
        const cached = rateCache[key];
        if (cached) return cached;
        const rate = await getExchangeRate(from, to);
        rateCache[key] = rate;
        return rate;
      }

      // Convert all transactions
      for (const transaction of txs) {
        let convertedAmount = parseFloat(transaction.amount);
        let convertedCurrency = transaction.currency || 'CAD';
        if (transaction.currency && transaction.currency !== targetCurrency) {
          const rate = await getRate(transaction.currency, targetCurrency);
          convertedAmount = convertedAmount * rate;
          convertedCurrency = targetCurrency;
        }
        // Add converted fields
        const txWithConversion: TransactionWithConversion = {
          ...transaction,
          convertedAmount,
          convertedCurrency
        };
        convertedTxs.push(txWithConversion);

        // Sum totals in target currency
        if (transaction.type === 'income') {
          totalIncome += convertedAmount;
        } else {
          totalExpenses += convertedAmount;
        }

        // Group by category
        if (!categories[transaction.category]) {
          categories[transaction.category] = {
            income: 0,
            expenses: 0,
            transactions: []
          };
        }
        // The block above just ensured this key exists.
        if (transaction.type === 'income') {
          categories[transaction.category]!.income += convertedAmount;
        } else {
          categories[transaction.category]!.expenses += convertedAmount;
        }
        categories[transaction.category]!.transactions.push(txWithConversion);
      }
      netIncome = totalIncome - totalExpenses;

      const summary = {
        year: parseInt(String(targetYear)),
        month: parseInt(String(targetMonth)),
        totalIncome,
        totalExpenses,
        netIncome,
        categories,
        transactions: convertedTxs,
        targetCurrency
      };

      res.json(summary);
    } catch (error) {
      console.error('Get monthly summary error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  /**
   * Summary over a window, chosen either as a **term** (`?term=2026-spring`,
   * `current`, `previous`) or as a rolling month count (`?months=4`).
   *
   * The term form exists because a rolling four months is not a term. Counting
   * back from today, the window equals the term only in April, August and
   * December — the last month of each, when it is already over. In the *first*
   * month of a co-op term, which is when someone sets a budget, three quarters
   * of a rolling window is the previous term's money.
   *
   * Term boundaries come from `utils/terms.js` and are never computed here:
   * the retention job will delete whole terms using the same module, and a view
   * and a deletion that disagree about where a term starts would fail silently.
   */
  async getRollingSummary(req: Request, res: Response) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Validated in shape only (rollingValidation), still plain strings off
      // req.query, as the original code read them.
      const term = req.query.term as string | undefined;
      const year = req.query.year as string | undefined;
      const months = (req.query.months as string | undefined) ?? 4;
      const targetCurrency = (req.query.targetCurrency as string | undefined) ?? 'CAD';
      const currentDate = new Date();

      let window: RollingWindow;
      if (term !== undefined) {
        const termId =
          term === 'current' ? currentTerm(currentDate)
            : term === 'previous' ? previousTerm(currentTerm(currentDate))
              : term;
        const { start, end } = boundsOf(termId);
        window = {
          start, end, term: termId, year: null,
          label: labelOf(termId), period: labelOf(termId),
        };
      } else if (year !== undefined) {
        // A year is three terms here, not twelve rolling months, so its bounds
        // come from the same module the term bounds do. A yearly total that
        // disagreed with the three term totals inside it would be worse than
        // no yearly view at all.
        const yearId =
          year === 'current' ? currentYear(currentDate)
            : year === 'previous' ? previousYear(currentYear(currentDate))
              : year;
        const { start, end } = yearBoundsOf(yearId);
        window = {
          start, end, term: null, year: yearId,
          label: yearLabelOf(yearId), period: yearLabelOf(yearId),
        };
      } else {
        // Half-open, like the term form: first of the month N-1 months back, up
        // to the first of next month.
        //
        // Built by arithmetic rather than `new Date(y, m, 1).toISOString()`,
        // which is what this used to do and is off by a day east of UTC —
        // under TZ=Asia/Shanghai that expression yields '2026-04-30' for May 1,
        // shifting every boundary and putting a day's transactions in the wrong
        // month. It escaped only because the server runs UTC.
        const startAbsolute = currentDate.getFullYear() * 12 + currentDate.getMonth() - parseInt(String(months)) + 1;
        const endAbsolute = currentDate.getFullYear() * 12 + currentDate.getMonth() + 1;
        window = {
          start: isoDate(Math.floor(startAbsolute / 12), startAbsolute % 12, 1),
          end: isoDate(Math.floor(endAbsolute / 12), endAbsolute % 12, 1),
          term: null,
          year: null,
          label: null,
          period: `${months}-month rolling`,
        };
      }

      // Get transactions for the window
      const transactions = await query<TransactionRow>(
        `SELECT * FROM transactions
         WHERE user_id = $1
         AND date >= $2
         AND date < $3
         ORDER BY date DESC`,
        [req.user.userId, window.start, window.end]
      );

      // Prepare for conversion
      const txs = transactions.rows;
      const convertedTxs: TransactionWithConversion[] = [];
      let totalIncome = 0;
      let totalExpenses = 0;
      let netIncome = 0;
      const categories: Record<string, RollingCategoryTotals> = {};
      // Cache for rates in this request
      const rateCache: Record<string, number> = {};
      async function getRate(from: string, to: string): Promise<number> {
        const key = `${from}_${to}`;
        const cached = rateCache[key];
        if (cached) return cached;
        const rate = await getExchangeRate(from, to);
        rateCache[key] = rate;
        return rate;
      }

      // Convert all transactions and build category totals in target currency
      for (const transaction of txs) {
        let convertedAmount = parseFloat(transaction.amount);
        let convertedCurrency = transaction.currency || 'CAD';
        if (transaction.currency && transaction.currency !== targetCurrency) {
          const rate = await getRate(transaction.currency, targetCurrency);
          convertedAmount = convertedAmount * rate;
          convertedCurrency = targetCurrency;
        }
        // Add converted fields
        const txWithConversion: TransactionWithConversion = {
          ...transaction,
          convertedAmount,
          convertedCurrency
        };
        convertedTxs.push(txWithConversion);

        // Sum totals in target currency
        if (transaction.type === 'income') {
          totalIncome += convertedAmount;
        } else {
          totalExpenses += convertedAmount;
        }

        // Group by category (in target currency)
        if (!categories[transaction.category]) {
          categories[transaction.category] = {
            total: 0,
            count: 0,
            average: 0
          };
        }
        // The block above just ensured this key exists.
        categories[transaction.category]!.total += convertedAmount;
        categories[transaction.category]!.count += 1;
      }

      netIncome = totalIncome - totalExpenses;

      // Group by month (for monthlyBreakdown, use converted amounts)
      const monthlyData: Record<string, MonthlyBreakdownEntry> = {};
      for (const tx of convertedTxs) {
        // Read the month off the day string. Rebuilding a Date to ask for its
        // month files every 1st-of-the-month under the month before, for any
        // reader west of UTC.
        // tx.date always came from a DATE column, which db/connection.ts's type
        // parser always hands back as 'YYYY-MM-DD' — monthOf's null case is for
        // arbitrary unknown input, not a stored transaction's own date, so this
        // assertion matches what is actually possible here.
        const monthKey = monthOf(tx.date)!;
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            month: monthKey,
            income: 0,
            expenses: 0,
            netIncome: 0,
            transactions: []
          };
        }
        // The block above just ensured this key exists.
        if (tx.type === 'income') {
          monthlyData[monthKey]!.income += tx.convertedAmount;
        } else {
          monthlyData[monthKey]!.expenses += tx.convertedAmount;
        }
        monthlyData[monthKey]!.transactions.push(tx);
        monthlyData[monthKey]!.netIncome = monthlyData[monthKey]!.income - monthlyData[monthKey]!.expenses;
      }

      // Calculate averages for categories
      Object.keys(categories).forEach(category => {
        // category is drawn from Object.keys(categories), so it always exists.
        categories[category]!.average = categories[category]!.total / categories[category]!.count;
      });

      const summary = {
        period: window.period,
        // Echoed so the client never computes a date or a term name itself, and
        // so a log line or a bug report says which window was actually served —
        // `months=4` does not tell you which four months.
        term: window.term,
        year: window.year,
        // The name of whichever window was served — a term, a year, or null
        // for a rolling count, which has no name. `termLabel` is the same value
        // under its old name, kept so a client built against the term-only
        // version keeps working.
        periodLabel: window.label,
        termLabel: window.label,
        startDate: window.start,
        endDate: window.end,
        totalIncome,
        totalExpenses,
        netIncome,
        monthlyBreakdown: Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month)),
        categories,
        transactions: convertedTxs,
        targetCurrency
      };

      res.json(summary);
    } catch (error) {
      console.error('Get rolling summary error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get spending trends
  async getSpendingTrends(req: Request, res: Response) {
    try {
      const months = (req.query.months as string | undefined) ?? 6;
      const currentDate = new Date();
      // Integer arithmetic, not `new Date(y, m, 1).toISOString()`: that form is
      // off by a day east of UTC, which would drop the first day of the window.
      const startAbsolute = currentDate.getFullYear() * 12 + currentDate.getMonth() - parseInt(String(months)) + 1;
      const startDate = isoDate(Math.floor(startAbsolute / 12), startAbsolute % 12, 1);

      // Get monthly spending by category
      const trends = await query<TrendRow>(
        `SELECT
           EXTRACT(YEAR FROM date) as year,
           EXTRACT(MONTH FROM date) as month,
           category,
           type,
           SUM(amount) as total_amount,
           COUNT(*) as transaction_count
         FROM transactions
         WHERE user_id = $1
         AND date >= $2
         GROUP BY EXTRACT(YEAR FROM date), EXTRACT(MONTH FROM date), category, type
         ORDER BY year, month, category`,
        [req.user.userId, startDate]
      );

      // Process trends data
      const processedTrends: Record<string, TrendMonth> = {};

      trends.rows.forEach(row => {
        const monthKey = `${row.year}-${String(row.month).padStart(2, '0')}`;

        if (!processedTrends[monthKey]) {
          processedTrends[monthKey] = {
            month: monthKey,
            categories: {},
            totalIncome: 0,
            totalExpenses: 0
          };
        }
        // The block above just ensured this key exists.
        const trendMonth = processedTrends[monthKey]!;

        if (!trendMonth.categories[row.category]) {
          trendMonth.categories[row.category] = {
            income: 0,
            expenses: 0,
            transactionCount: 0
          };
        }
        // The block above just ensured this key exists.
        const categoryTotals = trendMonth.categories[row.category]!;

        if (row.type === 'income') {
          categoryTotals.income += parseFloat(row.total_amount);
          trendMonth.totalIncome += parseFloat(row.total_amount);
        } else {
          categoryTotals.expenses += parseFloat(row.total_amount);
          trendMonth.totalExpenses += parseFloat(row.total_amount);
        }

        categoryTotals.transactionCount += parseInt(row.transaction_count);
      });

      res.json({
        trends: Object.values(processedTrends).sort((a, b) => a.month.localeCompare(b.month)),
        period: `${months} months`
      });

    } catch (error) {
      console.error('Get spending trends error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

export = summaryController;
