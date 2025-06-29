const db = require('../db/connection');

const summaryController = {
  // Get monthly summary
  async getMonthlySummary(req, res) {
    try {
      const { year, month } = req.query;
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

      // Calculate summaries
      const summary = {
        year: parseInt(targetYear),
        month: parseInt(targetMonth),
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        categories: {},
        transactions: transactions.rows
      };

      transactions.rows.forEach(transaction => {
        if (transaction.type === 'income') {
          summary.totalIncome += parseFloat(transaction.amount);
        } else {
          summary.totalExpenses += parseFloat(transaction.amount);
        }

        // Group by category
        if (!summary.categories[transaction.category]) {
          summary.categories[transaction.category] = {
            income: 0,
            expenses: 0,
            transactions: []
          };
        }

        if (transaction.type === 'income') {
          summary.categories[transaction.category].income += parseFloat(transaction.amount);
        } else {
          summary.categories[transaction.category].expenses += parseFloat(transaction.amount);
        }

        summary.categories[transaction.category].transactions.push(transaction);
      });

      summary.netIncome = summary.totalIncome - summary.totalExpenses;

      res.json(summary);

    } catch (error) {
      console.error('Get monthly summary error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get 4-month rolling summary
  async getRollingSummary(req, res) {
    try {
      const { months = 4 } = req.query;
      const currentDate = new Date();
      
      // Calculate date range for the last N months
      const endDate = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
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

      // Group by month
      const monthlyData = {};
      const summary = {
        period: `${months}-month rolling`,
        startDate: startDate.toISOString().split('T')[0],
        endDate: endDate.toISOString().split('T')[0],
        totalIncome: 0,
        totalExpenses: 0,
        netIncome: 0,
        monthlyBreakdown: [],
        categories: {}
      };

      transactions.rows.forEach(transaction => {
        const transactionDate = new Date(transaction.date);
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

        if (transaction.type === 'income') {
          monthlyData[monthKey].income += parseFloat(transaction.amount);
          summary.totalIncome += parseFloat(transaction.amount);
        } else {
          monthlyData[monthKey].expenses += parseFloat(transaction.amount);
          summary.totalExpenses += parseFloat(transaction.amount);
        }

        monthlyData[monthKey].transactions.push(transaction);
        monthlyData[monthKey].netIncome = monthlyData[monthKey].income - monthlyData[monthKey].expenses;

        // Category breakdown
        if (!summary.categories[transaction.category]) {
          summary.categories[transaction.category] = {
            total: 0,
            count: 0,
            average: 0
          };
        }

        summary.categories[transaction.category].total += parseFloat(transaction.amount);
        summary.categories[transaction.category].count += 1;
      });

      // Calculate averages and add monthly breakdown
      Object.keys(summary.categories).forEach(category => {
        summary.categories[category].average = summary.categories[category].total / summary.categories[category].count;
      });

      summary.monthlyBreakdown = Object.values(monthlyData).sort((a, b) => a.month.localeCompare(b.month));
      summary.netIncome = summary.totalIncome - summary.totalExpenses;

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