const nodemailer = require('nodemailer');
const db = require('../db/connection');

const transporter = nodemailer.createTransport({
  service: 'gmail', // Change if using another provider
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

exports.sendWeeklyReport = async (to, content, htmlContent) => {
  await transporter.sendMail({
    from: `"MindGo" <${process.env.EMAIL_USER}>`,
    to,
    subject: 'Your Weekly Financial Report',
    text: content,
    html: htmlContent,
  });
};

// Helper function to create ASCII pie chart
function createAsciiPieChart(data, title, maxWidth = 40) {
  if (Object.keys(data).length === 0) return '';
  
  let chart = `\n${title}\n`;
  chart += '═'.repeat(maxWidth) + '\n';
  
  const total = Object.values(data).reduce((sum, val) => sum + val, 0);
  const sortedData = Object.entries(data).sort((a, b) => b[1] - a[1]);
  
  sortedData.forEach(([category, amount], index) => {
    const percentage = ((amount / total) * 100).toFixed(1);
    const barLength = Math.round((amount / total) * (maxWidth - 20));
    const bar = '█'.repeat(barLength);
    const spaces = ' '.repeat(maxWidth - barLength - 20);
    
    chart += `${category.padEnd(15)} ${bar}${spaces} ${percentage}%\n`;
  });
  
  chart += '═'.repeat(maxWidth) + '\n';
  return chart;
}

exports.generateWeeklyReport = async (userId) => {
  try {
    // Get transactions from the past 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    
    const transactions = await db.query(
      `SELECT * FROM transactions 
       WHERE user_id = $1 AND date >= $2 
       ORDER BY date DESC, created_at DESC`,
      [userId, sevenDaysAgo.toISOString().split('T')[0]]
    );

    if (transactions.rows.length === 0) {
      return `📊 WEEKLY FINANCIAL REPORT\nPeriod: ${sevenDaysAgo.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}\n\nNo transactions found in the past 7 days.\n\nKeep up the great work managing your finances! 💪`;
    }

    // Organize transactions by type
    const income = transactions.rows.filter(t => t.type === 'income');
    const expenses = transactions.rows.filter(t => t.type === 'expense');

    // Calculate totals
    const totalIncome = income.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const totalExpenses = expenses.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const netIncome = totalIncome - totalExpenses;

    // Group by category
    const incomeByCategory = {};
    const expensesByCategory = {};

    income.forEach(t => {
      incomeByCategory[t.category] = (incomeByCategory[t.category] || 0) + parseFloat(t.amount);
    });

    expenses.forEach(t => {
      expensesByCategory[t.category] = (expensesByCategory[t.category] || 0) + parseFloat(t.amount);
    });

    // Helper for formatting columns (plain text)
    function pad(str, len) {
      return (str + '').padEnd(len, ' ');
    }
    function money(val) {
      return '$' + parseFloat(val).toFixed(2);
    }

    // Fetch user goals
    const goalsRes = await db.query('SELECT name, current_amount, target_amount, target_date FROM savings_goals WHERE user_id = $1', [userId]);
    const goals = goalsRes.rows;

    // Fetch user's current balance (net worth)
    let currentBalance = null;
    const netWorthRes = await db.query('SELECT net_worth FROM users WHERE id = $1', [userId]);
    if (netWorthRes.rows.length > 0) {
      currentBalance = parseFloat(netWorthRes.rows[0].net_worth);
    }

    // Fetch 4-month net income summary (dashboard style)
    const fourMonthsAgo = new Date();
    fourMonthsAgo.setMonth(fourMonthsAgo.getMonth() - 3); // includes current month
    const endOfThisMonth = new Date(new Date().getFullYear(), new Date().getMonth() + 1, 1);
    const rollingTx = await db.query(
      `SELECT * FROM transactions WHERE user_id = $1 AND date >= $2 AND date < $3`,
      [userId, fourMonthsAgo.toISOString().split('T')[0], endOfThisMonth.toISOString().split('T')[0]]
    );
    let rollingIncome = 0, rollingExpenses = 0;
    rollingTx.rows.forEach(t => {
      if (t.type === 'income') rollingIncome += parseFloat(t.amount);
      else if (t.type === 'expense') rollingExpenses += parseFloat(t.amount);
    });
    const rollingNetIncome = rollingIncome - rollingExpenses;

    // --- Plain Text Content ---
    let content = `📊 WEEKLY FINANCIAL REPORT\nPeriod: ${sevenDaysAgo.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}\n\n`;
    // Dashboard-style 4-month summary
    content += `==========================\n`;
    content += `📅 LAST 4 MONTHS SUMMARY\n`;
    content += `==========================\n`;
    content += pad('Total Income:', 18) + money(rollingIncome) + '\n';
    content += pad('Total Expenses:', 18) + money(rollingExpenses) + '\n';
    content += pad('Net Income:', 18) + money(rollingNetIncome) + '\n\n';
    // Summary
    content += `==========================\n`;
    content += `💰 WEEKLY SUMMARY\n`;
    content += `==========================\n`;
    content += pad('Total Income:', 18) + money(totalIncome) + '\n';
    content += pad('Total Expenses:', 18) + money(totalExpenses) + '\n';
    content += pad('Net Income:', 18) + money(netIncome) + '\n';
    if (currentBalance !== null) {
      content += pad('Current Balance:', 18) + money(currentBalance) + '\n';
    }
    content += '\n';
    // Goals Status
    if (goals.length > 0) {
      content += `==========================\n`;
      content += `🎯 GOALS STATUS\n`;
      content += `==========================\n`;
      content += pad('Goal', 18) + pad('Current', 10) + pad('Target', 10) + pad('Date', 12) + pad('%', 6) + '\n';
      content += '--------------------------------------------------------------\n';
      goals.forEach(g => {
        const percent = g.target_amount > 0 ? (100 * g.current_amount / g.target_amount) : 0;
        content += pad(g.name, 18) + pad(money(g.current_amount), 10) + pad(money(g.target_amount), 10) + pad(g.target_date ? new Date(g.target_date).toLocaleDateString() : '-', 12) + pad(percent.toFixed(1) + '%', 6) + '\n';
      });
      content += '\n';
    }

    // Income breakdown
    if (income.length > 0) {
      content += `==========================\n`;
      content += `📈 INCOME BREAKDOWN\n`;
      content += `==========================\n`;
      content += pad('Category', 22) + pad('Amount', 12) + '\n';
      content += '------------------------------\n';
      Object.entries(incomeByCategory).forEach(([category, amount]) => {
        content += pad(category, 22) + pad(money(amount), 12) + '\n';
      });
      content += '------------------------------\n';
      content += pad('Total Income:', 22) + pad(money(totalIncome), 12) + '\n\n';
    }

    // Expense breakdown
    if (expenses.length > 0) {
      content += `==========================\n`;
      content += `📉 EXPENSE BREAKDOWN\n`;
      content += `==========================\n`;
      content += pad('Category', 22) + pad('Amount', 12) + '\n';
      content += '------------------------------\n';
      Object.entries(expensesByCategory).forEach(([category, amount]) => {
        content += pad(category, 22) + pad(money(amount), 12) + '\n';
      });
      content += '------------------------------\n';
      content += pad('Total Expenses:', 22) + pad(money(totalExpenses), 12) + '\n\n';
    }

    // Recent transactions
    content += `==========================\n`;
    content += `📝 RECENT TRANSACTIONS\n`;
    content += `==========================\n`;
    content += pad('Date', 12) + pad('Type', 12) + pad('Description', 28) + pad('Amount', 10) + '\n';
    content += '--------------------------------------------------------------\n';
    transactions.rows.slice(0, 10).forEach(t => {
      const date = new Date(t.date).toLocaleDateString();
      const type = t.type === 'income' ? 'INCOME' : 'EXPENSE';
      const desc = t.description.length > 25 ? t.description.slice(0, 22) + '...' : t.description;
      content += pad(date, 12) + pad(type, 12) + pad(desc, 28) + pad(money(t.amount), 10) + '\n';
    });
    content += '\n';

    // Footer
    content += `Keep up the great work managing your finances! 💪\n\n`;
    content += `— The MindGo Team\n`;
    content += `https://mindgo.ca\n`;

    // --- HTML Content ---
    let html = `
      <div style="font-family: Arial, sans-serif; color: #222; max-width: 600px; margin: auto;">
        <h1 style="font-size: 2em; color: #2d3748; margin-bottom: 0.2em;">📊 WEEKLY FINANCIAL REPORT</h1>
        <div style="font-size: 1.1em; margin-bottom: 1.5em;">Period: ${sevenDaysAgo.toISOString().split('T')[0]} to ${new Date().toISOString().split('T')[0]}</div>

        <h2 style="color: #2d3748; border-bottom: 2px solid #eee; padding-bottom: 0.2em;">📅 LAST 4 MONTHS SUMMARY</h2>
        <table style="width: 100%; font-size: 1.1em; margin-bottom: 1.5em;">
          <tr><td>Total Income:</td><td style="font-weight: bold;">${money(rollingIncome)}</td></tr>
          <tr><td>Total Expenses:</td><td style="font-weight: bold;">${money(rollingExpenses)}</td></tr>
          <tr><td>Net Income:</td><td style="font-weight: bold; color: ${rollingNetIncome >= 0 ? '#38a169' : '#e53e3e'};">${money(rollingNetIncome)}</td></tr>
        </table>

        <h2 style="color: #2d3748; border-bottom: 2px solid #eee; padding-bottom: 0.2em;">💰 WEEKLY SUMMARY</h2>
        <table style="width: 100%; font-size: 1.1em; margin-bottom: 1.5em;">
          <tr><td>Total Income:</td><td style="font-weight: bold;">${money(totalIncome)}</td></tr>
          <tr><td>Total Expenses:</td><td style="font-weight: bold;">${money(totalExpenses)}</td></tr>
          <tr><td>Net Income:</td><td style="font-weight: bold; color: ${netIncome >= 0 ? '#38a169' : '#e53e3e'};">${money(netIncome)}</td></tr>
        </table>

        <h2 style="color: #2d3748; border-bottom: 2px solid #eee; padding-bottom: 0.2em;">📈 INCOME BREAKDOWN</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5em;">
          <tr style="background: #f7fafc;"><th align="left">Category</th><th align="right">Amount</th></tr>
          ${Object.entries(incomeByCategory).map(([cat, amt]) => `<tr><td>${cat}</td><td align="right">${money(amt)}</td></tr>`).join('')}
          <tr style="font-weight: bold;"><td>Total Income:</td><td align="right">${money(totalIncome)}</td></tr>
        </table>

        <h2 style="color: #2d3748; border-bottom: 2px solid #eee; padding-bottom: 0.2em;">📉 EXPENSE BREAKDOWN</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5em;">
          <tr style="background: #f7fafc;"><th align="left">Category</th><th align="right">Amount</th></tr>
          ${Object.entries(expensesByCategory).map(([cat, amt]) => `<tr><td>${cat}</td><td align="right">${money(amt)}</td></tr>`).join('')}
          <tr style="font-weight: bold;"><td>Total Expenses:</td><td align="right">${money(totalExpenses)}</td></tr>
        </table>

        <h2 style="color: #2d3748; border-bottom: 2px solid #eee; padding-bottom: 0.2em;">📝 RECENT TRANSACTIONS</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5em;">
          <tr style="background: #f7fafc;"><th align="left">Date</th><th align="left">Type</th><th align="left">Description</th><th align="right">Amount</th></tr>
          ${transactions.rows.slice(0, 10).map(t => {
            const date = new Date(t.date).toLocaleDateString();
            const type = t.type === 'income' ? 'INCOME' : 'EXPENSE';
            const desc = t.description.length > 25 ? t.description.slice(0, 22) + '...' : t.description;
            return `<tr><td>${date}</td><td>${type}</td><td>${desc}</td><td align="right">${money(t.amount)}</td></tr>`;
          }).join('')}
        </table>

        <h2 style="color: #2d3748; border-bottom: 2px solid #eee; padding-bottom: 0.2em;">🎯 GOALS STATUS</h2>
        <table style="width: 100%; border-collapse: collapse; margin-bottom: 1.5em;">
          <tr style="background: #f7fafc;"><th align="left">Goal</th><th align="right">Current</th><th align="right">Target</th><th align="center">Date</th><th align="right">%</th></tr>
          ${goals.map(g => {
            const percent = g.target_amount > 0 ? (100 * g.current_amount / g.target_amount) : 0;
            return `<tr><td>${g.name}</td><td align="right">${money(g.current_amount)}</td><td align="right">${money(g.target_amount)}</td><td align="center">${g.target_date ? new Date(g.target_date).toLocaleDateString() : '-'}</td><td align="right">${percent.toFixed(1)}%</td></tr>`;
          }).join('')}
        </table>

        <div style="margin-top: 2em; font-size: 1.1em;">Keep up the great work managing your finances! 💪</div>
        <div style="margin-top: 2em; color: #888; font-size: 1em;">— The MindGo Team<br><a href="https://mindgo.ca" style="color: #3182ce; text-decoration: none;">https://mindgo.ca</a></div>
      </div>
    `;

    return { text: content, html };
  } catch (error) {
    console.error('Error generating weekly report:', error);
    return { text: `📊 WEEKLY FINANCIAL REPORT\nUnable to generate weekly report at this time. Please try again later.`, html: `<div>Unable to generate weekly report at this time.</div>` };
  }
}; 