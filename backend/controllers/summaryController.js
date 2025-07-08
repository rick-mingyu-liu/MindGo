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
        categories: {},
        transactions: transactions.rows
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
  },

  // Daily check-in (POST)
  async checkIn(req, res) {
    try {
      const today = new Date();
      today.setHours(0,0,0,0);
      const todayStr = today.toISOString().split('T')[0];
      
      // Check if user already checked in today
      const existingCheckin = await db.query(
        'SELECT id FROM checkins WHERE user_id = $1 AND date = $2',
        [req.user.userId, todayStr]
      );

      if (existingCheckin.rows.length > 0) {
        return res.status(400).json({ error: 'Already checked in today!' });
      }

      // Insert check-in
      await db.query(
        'INSERT INTO checkins (user_id, date) VALUES ($1, $2)',
        [req.user.userId, todayStr]
      );

      // Update streak totals
      await summaryController.updateStreakTotals(req.user.userId);

      res.json({ success: true, message: 'Checked in for today!' });
    } catch (error) {
      console.error('Check-in error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get check-in streak (GET)
  async getCheckinStreak(req, res) {
    try {
      // Get streak totals for the user
      const result = await db.query(
        'SELECT current_streak, longest_streak, total_checkins, last_checkin_date FROM streak_totals WHERE user_id = $1',
        [req.user.userId]
      );

      if (result.rows.length === 0) {
        // Initialize streak totals for new user
        await db.query(
          'INSERT INTO streak_totals (user_id) VALUES ($1)',
          [req.user.userId]
        );
        return res.json({ streak: 0, longestStreak: 0, totalCheckins: 0, lastCheckinDate: null });
      }

      const totals = result.rows[0];
      res.json({ 
        streak: totals.current_streak || 0,
        longestStreak: totals.longest_streak || 0,
        totalCheckins: totals.total_checkins || 0,
        lastCheckinDate: totals.last_checkin_date || null
      });
    } catch (error) {
      console.error('Get check-in streak error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Helper method to update streak totals
  async updateStreakTotals(userId) {
    try {
      // Get all check-in dates for the user, sorted descending
      const result = await db.query(
        'SELECT date FROM checkins WHERE user_id = $1 ORDER BY date DESC',
        [userId]
      );

      const dates = result.rows.map(row => row.date);
      if (dates.length === 0) return;

      // Calculate current streak
      let currentStreak = 0;
      let current = new Date();
      current.setHours(0, 0, 0, 0);

      for (const date of dates) {
        const checkinDate = new Date(date);
        checkinDate.setHours(0, 0, 0, 0);
        
        if (checkinDate.getTime() === current.getTime()) {
          currentStreak++;
          current.setDate(current.getDate() - 1);
        } else if (checkinDate.getTime() === current.getTime() - 86400000) {
          currentStreak++;
          current.setDate(current.getDate() - 1);
        } else {
          break;
        }
      }

      // Get or create streak totals record
      let streakTotals = await db.query(
        'SELECT * FROM streak_totals WHERE user_id = $1',
        [userId]
      );

      if (streakTotals.rows.length === 0) {
        // Create new record
        await db.query(
          `INSERT INTO streak_totals (user_id, current_streak, longest_streak, total_checkins, last_checkin_date) 
           VALUES ($1, $2, $3, $4, $5)`,
          [userId, currentStreak, currentStreak, dates.length, dates[0]]
        );
      } else {
        // Update existing record
        const existing = streakTotals.rows[0];
        const longestStreak = Math.max(existing.longest_streak || 0, currentStreak);
        
        await db.query(
          `UPDATE streak_totals 
           SET current_streak = $1, longest_streak = $2, total_checkins = $3, last_checkin_date = $4, updated_at = CURRENT_TIMESTAMP
           WHERE user_id = $5`,
          [currentStreak, longestStreak, dates.length, dates[0], userId]
        );
      }
    } catch (error) {
      console.error('Update streak totals error:', error);
    }
  }
};

module.exports = summaryController; 