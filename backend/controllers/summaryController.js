const { validationResult } = require('express-validator');
const db = require('../db/connection');
const { getExchangeRate } = require('../services/exchangeRateService');
const {
  boundsOf, labelOf, currentTerm, previousTerm,
  yearBoundsOf, yearLabelOf, currentYear, previousYear,
} = require('../utils/terms');
const { monthOf } = require('../utils/dates');

/** `(2026, 4, 1)` -> `'2026-05-01'`. month is 0-based, as in `Date`. */
const isoDate = (year, month, day) =>
  `${year}-${String(month + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const summaryController = {
  // Get monthly summary
  async getMonthlySummary(req, res) {
    try {
      const { year, month, targetCurrency = 'CAD' } = req.query;
      const currentDate = new Date();
      const targetYear = year || currentDate.getFullYear();
      const targetMonth = month || currentDate.getMonth() + 1;

      // Get transactions for the specified month
      const transactions = await db.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         AND EXTRACT(YEAR FROM date) = $2 
         AND EXTRACT(MONTH FROM date) = $3
         ORDER BY date DESC`,
        [req.user.userId, targetYear, targetMonth]
      );

      // Prepare for conversion
      const txs = transactions.rows;
      const convertedTxs = [];
      let totalIncome = 0;
      let totalExpenses = 0;
      let netIncome = 0;
      const categories = {};

      // Cache for rates in this request
      const rateCache = {};
      async function getRate(from, to) {
        const key = `${from}_${to}`;
        if (rateCache[key]) return rateCache[key];
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
        const txWithConversion = {
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
        if (transaction.type === 'income') {
          categories[transaction.category].income += convertedAmount;
        } else {
          categories[transaction.category].expenses += convertedAmount;
        }
        categories[transaction.category].transactions.push(txWithConversion);
      }
      netIncome = totalIncome - totalExpenses;

      const summary = {
        year: parseInt(targetYear),
        month: parseInt(targetMonth),
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
  async getRollingSummary(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { months = 4, term, year, targetCurrency = 'CAD' } = req.query;
      const currentDate = new Date();

      let window;
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
        const startAbsolute = currentDate.getFullYear() * 12 + currentDate.getMonth() - parseInt(months) + 1;
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
      const transactions = await db.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         AND date >= $2 
         AND date < $3
         ORDER BY date DESC`,
        [req.user.userId, window.start, window.end]
      );

      // Prepare for conversion
      const txs = transactions.rows;
      const convertedTxs = [];
      let totalIncome = 0;
      let totalExpenses = 0;
      let netIncome = 0;
      const categories = {};
      // Cache for rates in this request
      const rateCache = {};
      async function getRate(from, to) {
        const key = `${from}_${to}`;
        if (rateCache[key]) return rateCache[key];
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
        const txWithConversion = {
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
        categories[transaction.category].total += convertedAmount;
        categories[transaction.category].count += 1;
      }

      netIncome = totalIncome - totalExpenses;

      // Group by month (for monthlyBreakdown, use converted amounts)
      const monthlyData = {};
      for (const tx of convertedTxs) {
        // Read the month off the day string. Rebuilding a Date to ask for its
        // month files every 1st-of-the-month under the month before, for any
        // reader west of UTC.
        const monthKey = monthOf(tx.date);
        if (!monthlyData[monthKey]) {
          monthlyData[monthKey] = {
            month: monthKey,
            income: 0,
            expenses: 0,
            netIncome: 0,
            transactions: []
          };
        }
        if (tx.type === 'income') {
          monthlyData[monthKey].income += tx.convertedAmount;
        } else {
          monthlyData[monthKey].expenses += tx.convertedAmount;
        }
        monthlyData[monthKey].transactions.push(tx);
        monthlyData[monthKey].netIncome = monthlyData[monthKey].income - monthlyData[monthKey].expenses;
      }

      // Calculate averages for categories
      Object.keys(categories).forEach(category => {
        categories[category].average = categories[category].total / categories[category].count;
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
  async getSpendingTrends(req, res) {
    try {
      const { months = 6 } = req.query;
      const currentDate = new Date();
      // Integer arithmetic, not `new Date(y, m, 1).toISOString()`: that form is
      // off by a day east of UTC, which would drop the first day of the window.
      const startAbsolute = currentDate.getFullYear() * 12 + currentDate.getMonth() - parseInt(months) + 1;
      const startDate = isoDate(Math.floor(startAbsolute / 12), startAbsolute % 12, 1);

      // Get monthly spending by category
      const trends = await db.query(
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
      const processedTrends = {};
      
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

        if (!processedTrends[monthKey].categories[row.category]) {
          processedTrends[monthKey].categories[row.category] = {
            income: 0,
            expenses: 0,
            transactionCount: 0
          };
        }

        if (row.type === 'income') {
          processedTrends[monthKey].categories[row.category].income += parseFloat(row.total_amount);
          processedTrends[monthKey].totalIncome += parseFloat(row.total_amount);
        } else {
          processedTrends[monthKey].categories[row.category].expenses += parseFloat(row.total_amount);
          processedTrends[monthKey].totalExpenses += parseFloat(row.total_amount);
        }

        processedTrends[monthKey].categories[row.category].transactionCount += parseInt(row.transaction_count);
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

module.exports = summaryController;
