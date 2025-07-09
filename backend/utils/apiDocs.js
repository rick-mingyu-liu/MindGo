const config = require('../config');

class APIDocumentation {
  constructor() {
    this.endpoints = [];
  }

  // Add an endpoint to the documentation
  addEndpoint(method, path, description, controller, auth = false, rateLimit = null) {
    this.endpoints.push({
      method: method.toUpperCase(),
      path,
      description,
      controller,
      auth,
      rateLimit
    });
  }

  // Generate API documentation
  generateDocs() {
    const baseUrl = `http://localhost:${config.port}`;
    
    let docs = `# MindGo API Documentation\n\n`;
    docs += `Base URL: \`${baseUrl}\`\n\n`;
    
    // Group by category
    const categories = {
      'Authentication': this.endpoints.filter(e => e.path.startsWith('/auth')),
      'Transactions': this.endpoints.filter(e => e.path.startsWith('/transactions')),
      'Financial Summary': this.endpoints.filter(e => e.path.startsWith('/summary')),
      'Goals': this.endpoints.filter(e => e.path.startsWith('/goals')),
      'Investments': this.endpoints.filter(e => e.path.startsWith('/investments')),
      'AI Features': this.endpoints.filter(e => e.path.startsWith('/ai')),
      'System': this.endpoints.filter(e => e.path === '/health')
    };

    for (const [category, endpoints] of Object.entries(categories)) {
      if (endpoints.length === 0) continue;
      
      docs += `## ${category}\n\n`;
      
      for (const endpoint of endpoints) {
        const authBadge = endpoint.auth ? '🔐' : '';
        const rateLimitBadge = endpoint.rateLimit ? '⏱️' : '';
        
        docs += `### ${endpoint.method} ${endpoint.path} ${authBadge}${rateLimitBadge}\n\n`;
        docs += `${endpoint.description}\n\n`;
        docs += `**Controller:** \`${endpoint.controller}\`\n\n`;
        
        if (endpoint.auth) {
          docs += `**Authentication:** Required\n\n`;
        }
        
        if (endpoint.rateLimit) {
          docs += `**Rate Limit:** ${endpoint.rateLimit}\n\n`;
        }
        
        docs += `**Full URL:** \`${baseUrl}${endpoint.path}\`\n\n`;
        docs += `---\n\n`;
      }
    }

    return docs;
  }

  // Get endpoints as JSON
  getEndpoints() {
    return this.endpoints;
  }

  // Get endpoints by category
  getEndpointsByCategory() {
    const categories = {};
    
    for (const endpoint of this.endpoints) {
      const category = this.getCategoryFromPath(endpoint.path);
      if (!categories[category]) {
        categories[category] = [];
      }
      categories[category].push(endpoint);
    }
    
    return categories;
  }

  // Get category from path
  getCategoryFromPath(path) {
    if (path.startsWith('/auth')) return 'Authentication';
    if (path.startsWith('/transactions')) return 'Transactions';
    if (path.startsWith('/summary')) return 'Financial Summary';
    if (path.startsWith('/goals')) return 'Goals';
    if (path.startsWith('/investments')) return 'Investments';
    if (path.startsWith('/ai')) return 'AI Features';
    if (path === '/health') return 'System';
    return 'Other';
  }
}

// Create global instance
const apiDocs = new APIDocumentation();

// Add all endpoints
apiDocs.addEndpoint('GET', '/health', 'Health check endpoint', 'System', false);
apiDocs.addEndpoint('POST', '/auth/login', 'User login', 'authController.login', false, '5 per 15min');
apiDocs.addEndpoint('POST', '/auth/register', 'User registration', 'authController.register', false, '5 per 15min');
apiDocs.addEndpoint('POST', '/auth/verify-email/:token', 'Email verification', 'authController.verifyEmail', false);
apiDocs.addEndpoint('POST', '/auth/resend-verification', 'Resend verification email', 'authController.resendVerification', false);
apiDocs.addEndpoint('GET', '/auth/profile', 'Get user profile', 'authController.getProfile', true);
apiDocs.addEndpoint('PUT', '/auth/profile', 'Update user profile', 'authController.updateProfile', true);
apiDocs.addEndpoint('PUT', '/auth/notifications', 'Update notification settings', 'authController.updateNotificationSettings', true);

// Transactions
apiDocs.addEndpoint('GET', '/transactions', 'Get user transactions', 'transactionController.getTransactions', true);
apiDocs.addEndpoint('POST', '/transactions', 'Create new transaction', 'transactionController.createTransaction', true);
apiDocs.addEndpoint('PUT', '/transactions/:id', 'Update transaction', 'transactionController.updateTransaction', true);
apiDocs.addEndpoint('DELETE', '/transactions/:id', 'Delete transaction', 'transactionController.deleteTransaction', true);
apiDocs.addEndpoint('GET', '/transactions/categories', 'Get transaction categories', 'transactionController.getCategories', true);
apiDocs.addEndpoint('DELETE', '/transactions/clear-all', 'Clear all transactions', 'transactionController.clearAllTransactions', true);
apiDocs.addEndpoint('DELETE', '/transactions/auto-delete', 'Auto delete old transactions', 'transactionController.autoDeleteOldTransactions', true);
apiDocs.addEndpoint('GET', '/transactions/retention-settings', 'Get data retention settings', 'transactionController.getDataRetentionSettings', true);
apiDocs.addEndpoint('PUT', '/transactions/retention-settings', 'Update data retention settings', 'transactionController.updateDataRetentionSettings', true);

// Summary
apiDocs.addEndpoint('GET', '/summary/monthly', 'Get monthly summary', 'summaryController.getMonthlySummary', true);
apiDocs.addEndpoint('GET', '/summary/rolling', 'Get rolling summary', 'summaryController.getRollingSummary', true);
apiDocs.addEndpoint('GET', '/summary/trends', 'Get spending trends', 'summaryController.getSpendingTrends', true);
apiDocs.addEndpoint('POST', '/summary/checkin', 'Daily check-in', 'summaryController.checkIn', true);
apiDocs.addEndpoint('GET', '/summary/checkin-streak', 'Get check-in streak', 'summaryController.getCheckInStreak', true);

// Goals
apiDocs.addEndpoint('GET', '/goals', 'Get user goals', 'goalController.getGoals', true);
apiDocs.addEndpoint('POST', '/goals', 'Create new goal', 'goalController.createGoal', true);
apiDocs.addEndpoint('PUT', '/goals/:id', 'Update goal', 'goalController.updateGoal', true);
apiDocs.addEndpoint('DELETE', '/goals/:id', 'Delete goal', 'goalController.deleteGoal', true);
apiDocs.addEndpoint('PUT', '/goals/:id/progress', 'Update goal progress', 'goalController.updateProgress', true);
apiDocs.addEndpoint('GET', '/goals/stats', 'Get goal statistics', 'goalController.getGoalStats', true);
apiDocs.addEndpoint('DELETE', '/goals/clear-all', 'Clear all goals', 'goalController.clearAllGoals', true);

// Investments
apiDocs.addEndpoint('GET', '/investments/snapshot/:symbol', 'Get stock snapshot', 'investmentController.getStockSnapshot', true);
apiDocs.addEndpoint('GET', '/investments/watchlist', 'Get user watchlist', 'investmentController.getWatchlist', true);
apiDocs.addEndpoint('POST', '/investments/watchlist', 'Add to watchlist', 'investmentController.addToWatchlist', true);
apiDocs.addEndpoint('DELETE', '/investments/watchlist/:id', 'Remove from watchlist', 'investmentController.removeFromWatchlist', true);
apiDocs.addEndpoint('DELETE', '/investments/watchlist/clear-all', 'Clear all watchlist', 'investmentController.clearAllWatchlist', true);
apiDocs.addEndpoint('GET', '/investments/historical/:symbol', 'Get historical data', 'investmentController.getHistoricalData', true);
apiDocs.addEndpoint('GET', '/investments/market-overview', 'Get market overview', 'investmentController.getMarketOverview', true);
apiDocs.addEndpoint('GET', '/investments/news/:symbol', 'Get stock news', 'investmentController.getStockNews', true);
apiDocs.addEndpoint('GET', '/investments/financials/:symbol', 'Get stock financials', 'investmentController.getStockFinancials', true);
apiDocs.addEndpoint('GET', '/investments/watchlist/ai-summary', 'Get AI summary of watchlist', 'investmentController.getWatchlistAISummary', true);
apiDocs.addEndpoint('GET', '/investments/search', 'Search stocks', 'investmentController.searchStocks', true);

// AI Features
apiDocs.addEndpoint('POST', '/ai/plan', 'Generate financial plan', 'aiController.generatePlan', true, '20 per hour');
apiDocs.addEndpoint('GET', '/ai/plans', 'Get plan history', 'aiController.getPlanHistory', true);
apiDocs.addEndpoint('GET', '/ai/plans/:id', 'Get specific plan', 'aiController.getPlan', true);
apiDocs.addEndpoint('POST', '/ai/budget-recommendations', 'Get budget recommendations', 'aiController.generateBudgetRecommendations', true, '20 per hour');
apiDocs.addEndpoint('POST', '/ai/investment-advice', 'Get investment advice', 'aiController.generateInvestmentAdvice', true, '20 per hour');

module.exports = apiDocs; 