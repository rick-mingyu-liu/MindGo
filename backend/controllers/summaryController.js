const db = require('../db/connection');
const { getExchangeRate } = require('../services/exchangeRateService');

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

  // Get 4-month rolling summary
  async getRollingSummary(req, res) {
    try {
      const { months = 4, targetCurrency = 'CAD' } = req.query;
      const currentDate = new Date();
      
      // Calculate date range for the last N months (including current month)
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 1); // First day of next month
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - parseInt(months) + 1, 1);

      // Get transactions for the rolling period
      const transactions = await db.query(
        `SELECT * FROM transactions 
         WHERE user_id = $1 
         AND date >= $2 
         AND date < $3
         ORDER BY date DESC`,
        [req.user.userId, startDate.toISOString().split('T')[0], endDate.toISOString().split('T')[0]]
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
        const transactionDate = new Date(tx.date);
        const monthKey = `${transactionDate.getFullYear()}-${String(transactionDate.getMonth() + 1).padStart(2, '0')}`;
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
        period: `${months}-month rolling`,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
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
      const startDate = new Date(currentDate.getFullYear(), currentDate.getMonth() - parseInt(months) + 1, 1);

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
        [req.user.userId, startDate.toISOString().split('T')[0]]
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
