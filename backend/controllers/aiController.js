const { validationResult } = require('express-validator');
const db = require('../db/connection');
const aiPlanner = require('../services/aiPlanner');
const { monthOf, monthSpan } = require('../utils/dates');

const aiController = {
  // Generate AI financial plan
  async generatePlan(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      // Handle both old and new frontend formats
      const { 
        prompt, 
        includeFinancialData = true,
        // New frontend format
        financialGoal,
        currentIncome,
        currentExpenses,
        timeline,
        additionalContext,
        riskTolerance,
        lifeStage,
        investmentExperience,
        language
      } = req.body;

      // Use new format if available, otherwise fall back to old format
      const userPrompt = financialGoal || prompt;
      
      if (!userPrompt) {
        return res.status(400).json({ error: 'Financial goal or prompt is required' });
      }

      let financialData = null;

      if (includeFinancialData) {
        // Get user's financial data for context
        financialData = await aiController.getUserFinancialData(req.user.userId);
        
        // Add form data to financial context
        if (currentIncome || currentExpenses || timeline || additionalContext) {
          financialData = {
            ...financialData,
            formData: {
              currentIncome: currentIncome || 0,
              currentExpenses: currentExpenses || 0,
              timeline: timeline || 'Not specified',
              additionalContext: additionalContext || ''
            }
          };
        }
      }

      // Build comprehensive prompt for AI
      let comprehensivePrompt = userPrompt;
      
      if (timeline) {
        comprehensivePrompt += `\n\nTimeline: ${timeline}`;
      }
      
      if (currentIncome && currentExpenses) {
        comprehensivePrompt += `\n\nCurrent Financial Situation:\n- Monthly Income: $${currentIncome}\n- Monthly Expenses: $${currentExpenses}\n- Monthly Savings: $${currentIncome - currentExpenses}`;
      }
      
      if (additionalContext) {
        comprehensivePrompt += `\n\nAdditional Context: ${additionalContext}`;
      }

      // Add user preferences to the prompt
      if (riskTolerance || lifeStage || investmentExperience) {
        comprehensivePrompt += `\n\nUser Preferences for Planning:\n- Risk Tolerance: ${riskTolerance || 'Not specified'}\n- Life Stage: ${lifeStage || 'Not specified'}\n- Investment Experience: ${investmentExperience || 'Not specified'}`;
      }

      // Generate AI plan
      const aiResponse = await aiPlanner.generatePlan(comprehensivePrompt, financialData, language);

      // Parse the AI response to extract structured data
      const structuredResponse = aiController.parseAIResponse(aiResponse);

      // Save the plan to database
      const savedPlan = await db.query(
        'INSERT INTO ai_plans (user_id, prompt, response) VALUES ($1, $2, $3) RETURNING *',
        [req.user.userId, userPrompt, aiResponse]
      );

      res.json({
        message: 'AI plan generated successfully',
        plan: {
          id: savedPlan.rows[0].id,
          prompt: userPrompt,
          response: aiResponse,
          created_at: savedPlan.rows[0].created_at
        },
        ...structuredResponse
      });

    } catch (error) {
      console.error('Generate AI plan error:', error);
      
      if (error.message.includes('OpenAI API key')) {
        return res.status(500).json({ error: 'AI service not configured. Please set up OpenAI API key.' });
      }
      
      res.status(500).json({ error: 'Failed to generate AI plan' });
    }
  },

  // Parse AI response to extract structured data
  parseAIResponse(aiResponse) {
    try {
      // Try to extract structured information from the AI response
      const analysis = aiResponse;
      
      // Extract recommendations (look for numbered lists or bullet points)
      const recommendations = aiController.extractRecommendations(aiResponse);
      
      // Extract action plan (look for action-oriented statements)
      const actionPlan = aiController.extractActionPlan(aiResponse);
      
      // Extract timeline estimate
      const estimatedTimeline = aiController.extractTimeline(aiResponse);
      
      // Extract risk factors
      const riskFactors = aiController.extractRiskFactors(aiResponse);

      return {
        analysis,
        recommendations,
        actionPlan,
        estimatedTimeline,
        riskFactors
      };
    } catch (error) {
      console.error('Error parsing AI response:', error);
      return {
        analysis: aiResponse,
        recommendations: ['Review the analysis above for specific recommendations'],
        actionPlan: ['Consider implementing the suggestions provided in the analysis'],
        estimatedTimeline: 'Varies based on implementation',
        riskFactors: ['Market conditions', 'Personal circumstances', 'Economic changes']
      };
    }
  },

  // Extract recommendations from AI response
  extractRecommendations(response) {
    const recommendations = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.match(/^\d+\.\s/) || trimmed.match(/^•\s/) || trimmed.match(/^-\s/)) {
        const recommendation = trimmed.replace(/^\d+\.\s|^•\s|^-\s/, '').trim();
        if (recommendation && recommendation.length > 10) {
          recommendations.push(recommendation);
        }
      }
    }
    
    return recommendations.length > 0 ? recommendations : ['Review your spending habits and identify areas for improvement'];
  },

  // Extract action plan from AI response
  extractActionPlan(response) {
    const actionPlan = [];
    const lines = response.split('\n');
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().includes('action') || 
          trimmed.toLowerCase().includes('step') ||
          trimmed.toLowerCase().includes('implement') ||
          trimmed.toLowerCase().includes('start')) {
        if (trimmed.length > 10 && !actionPlan.includes(trimmed)) {
          actionPlan.push(trimmed);
        }
      }
    }
    
    return actionPlan.length > 0 ? actionPlan : ['Create a detailed budget', 'Set up automatic savings', 'Track your expenses regularly'];
  },

  // Extract timeline from AI response
  extractTimeline(response) {
    const timelineKeywords = ['timeline', 'timeframe', 'duration', 'months', 'years', 'weeks'];
    const lines = response.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const keyword of timelineKeywords) {
        if (lowerLine.includes(keyword)) {
          return line.trim();
        }
      }
    }
    
    return 'Timeline will depend on your implementation and consistency';
  },

  // Extract risk factors from AI response
  extractRiskFactors(response) {
    const riskFactors = [];
    const riskKeywords = ['risk', 'challenge', 'obstacle', 'difficulty', 'uncertainty'];
    const lines = response.split('\n');
    
    for (const line of lines) {
      const lowerLine = line.toLowerCase();
      for (const keyword of riskKeywords) {
        if (lowerLine.includes(keyword) && line.length > 10) {
          riskFactors.push(line.trim());
          break;
        }
      }
    }
    
    return riskFactors.length > 0 ? riskFactors : ['Market volatility', 'Unexpected expenses', 'Changes in income'];
  },

  // Get user's financial data for AI context
  async getUserFinancialData(userId) {
    try {
      // Get recent transactions (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const transactions = await db.query(
        'SELECT * FROM transactions WHERE user_id = $1 AND date >= $2 ORDER BY date DESC',
        [userId, sixMonthsAgo.toISOString().split('T')[0]]
      );

      // Get savings goals
      const goals = await db.query(
        'SELECT * FROM savings_goals WHERE user_id = $1',
        [userId]
      );

      // Calculate financial metrics
      const monthlyIncome = aiController.calculateMonthlyAverage(transactions.rows, 'income');
      const monthlyExpenses = aiController.calculateMonthlyAverage(transactions.rows, 'expense');
      const totalSavings = goals.rows.reduce((sum, goal) => sum + parseFloat(goal.current_amount), 0);
      const totalTargetSavings = goals.rows.reduce((sum, goal) => sum + parseFloat(goal.target_amount), 0);

      // Get spending by category
      const spendingByCategory = aiController.calculateSpendingByCategory(transactions.rows);

      return {
        monthlyIncome,
        monthlyExpenses,
        savings: totalSavings,
        targetSavings: totalTargetSavings,
        goals: goals.rows.map(goal => ({
          name: goal.name,
          target: goal.target_amount,
          current: goal.current_amount,
          progress: (goal.current_amount / goal.target_amount) * 100
        })),
        spendingByCategory,
        recentTransactions: transactions.rows.slice(0, 10) // Last 10 transactions
      };

    } catch (error) {
      console.error('Get user financial data error:', error);
      return null;
    }
  },

  // Calculate monthly average for income or expenses
  calculateMonthlyAverage(transactions, type) {
    const filteredTransactions = transactions.filter(t => t.type === type);
    if (filteredTransactions.length === 0) return 0;

    const total = filteredTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const months = aiController.getMonthCount(transactions);
    
    return months > 0 ? total / months : 0;
  },

  // Get number of months from transactions
  getMonthCount(transactions) {
    if (transactions.length === 0) return 0;

    // Month keys sort lexicographically, so min/max need no Date at all — and
    // going through one would shift a 1st-of-the-month into the month before.
    const months = transactions.map(t => monthOf(t.date)).filter(Boolean).sort();
    if (months.length === 0) return 0;

    return monthSpan(months[0], months[months.length - 1]);
  },

  // Calculate spending by category
  calculateSpendingByCategory(transactions) {
    const categorySpending = {};
    
    transactions.forEach(transaction => {
      if (transaction.type === 'expense') {
        if (!categorySpending[transaction.category]) {
          categorySpending[transaction.category] = 0;
        }
        categorySpending[transaction.category] += parseFloat(transaction.amount);
      }
    });

    return categorySpending;
  },

  // Get user's AI plan history
  async getPlanHistory(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      const offset = (page - 1) * limit;

      const plans = await db.query(
        'SELECT * FROM ai_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.user.userId, parseInt(limit), offset]
      );

      const countResult = await db.query(
        'SELECT COUNT(*) FROM ai_plans WHERE user_id = $1',
        [req.user.userId]
      );

      const totalCount = parseInt(countResult.rows[0].count);

      res.json({
        plans: plans.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / limit)
        }
      });

    } catch (error) {
      console.error('Get plan history error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get specific AI plan
  async getPlan(req, res) {
    try {
      const { id } = req.params;

      const plan = await db.query(
        'SELECT * FROM ai_plans WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (plan.rows.length === 0) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      res.json({ plan: plan.rows[0] });

    } catch (error) {
      console.error('Get plan error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Generate budget recommendations
  async generateBudgetRecommendations(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const financialData = await aiController.getUserFinancialData(req.user.userId);
      const recommendations = await aiPlanner.generateBudgetRecommendations(financialData);

      res.json({
        message: 'Budget recommendations generated successfully',
        recommendations
      });

    } catch (error) {
      console.error('Generate budget recommendations error:', error);
      res.status(500).json({ error: 'Failed to generate budget recommendations' });
    }
  },

  // Generate investment advice
  async generateInvestmentAdvice(req, res) {
    try {
      const { riskTolerance, investmentAmount, timeHorizon, goals } = req.body;

      const investmentProfile = {
        riskTolerance: riskTolerance || 'moderate',
        investmentAmount: investmentAmount || 0,
        timeHorizon: timeHorizon || '5-10 years',
        goals: goals || ['retirement', 'wealth building'],
        currentSavings: 0 // Will be populated from financial data
      };

      // Get current savings from financial data
      const financialData = await aiController.getUserFinancialData(req.user.userId);
      if (financialData) {
        investmentProfile.currentSavings = financialData.savings;
      }

      const advice = await aiPlanner.generateInvestmentAdvice(investmentProfile);

      res.json({
        message: 'Investment advice generated successfully',
        advice
      });

    } catch (error) {
      console.error('Generate investment advice error:', error);
      res.status(500).json({ error: 'Failed to generate investment advice' });
    }
  }
};

module.exports = aiController; 