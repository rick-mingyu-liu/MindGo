import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { query } from '../db/connection';
import aiPlanner = require('../services/aiPlanner');
import { monthOf, monthSpan } from '../utils/dates';
import type { TransactionRow, TransactionType, AiPlanRow } from '../types/db';

/**
 * getUserFinancialData's per-goal summary, as aiPlanner's prompt builder
 * reads it. current/target are DECIMAL columns and arrive as strings
 * (current_amount is nullable -- no NOT NULL, just a DEFAULT 0 -- so its type
 * carries that too; target_amount is NOT NULL).
 * aiPlanner.buildFinancialContext only ever interpolates them into a
 * template literal, so keeping them string here (matching aiPlanner.ts's own
 * GoalSummary) is what keeps '12.50' from becoming '12.5'.
 */
interface GoalSummary {
  name: string;
  target: string;
  current: string | null;
  progress: number;
}

/**
 * What getUserFinancialData always builds on its success path -- every field
 * is present, unlike aiPlanner's own (unexported) FinancialData, which types
 * the same fields optional because a caller can also send only a subset (see
 * FinancialData below).
 */
interface UserFinancialData {
  monthlyIncome: number;
  monthlyExpenses: number;
  savings: number;
  targetSavings: number;
  goals: GoalSummary[];
  spendingByCategory: Record<string, number>;
  recentTransactions: TransactionRow[];
}

/**
 * The shape generatePlan actually assembles and passes to
 * aiPlanner.generatePlan(). aiPlanner.ts declares its own structurally
 * identical FinancialData/FormData interfaces but does not export them, so
 * this is a separate declaration rather than an import -- TypeScript checks
 * the aiPlanner.generatePlan(...) call site structurally either way.
 */
interface FinancialData {
  formData?: {
    currentIncome?: number;
    currentExpenses?: number;
    timeline?: string;
    additionalContext?: string;
  };
  monthlyIncome?: number;
  monthlyExpenses?: number;
  savings?: number;
  targetSavings?: number;
  goals?: GoalSummary[];
  spendingByCategory?: Record<string, number>;
  recentTransactions?: TransactionRow[];
}

interface ParsedAiResponse {
  analysis: string | null;
  recommendations: string[];
  actionPlan: string[];
  estimatedTimeline: string;
  riskFactors: string[];
}

/**
 * Answers 503 when OpenAI will not take requests for now (no credit, rate
 * limit), so the page can say so instead of reporting a server fault.
 */
function answerIfUnavailable(res: Response, error: unknown): boolean {
  if (!(error instanceof Error) || error.name !== 'AiUnavailableError') return false;
  res.status(503).json({
    error: 'AI planning is temporarily unavailable. Please try again later.',
    code: 'ai_unavailable',
  });
  return true;
}

const aiController = {
  // Generate AI financial plan
  async generatePlan(req: Request, res: Response) {
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

      let financialData: FinancialData | null = null;

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
      const savedPlan = await query<AiPlanRow>(
        'INSERT INTO ai_plans (user_id, prompt, response) VALUES ($1, $2, $3) RETURNING *',
        [req.user.userId, userPrompt, aiResponse]
      );

      res.json({
        message: 'AI plan generated successfully',
        plan: {
          // RETURNING always answers with the row just inserted, so rows[0]
          // is never undefined here.
          id: savedPlan.rows[0]!.id,
          prompt: userPrompt,
          response: aiResponse,
          created_at: savedPlan.rows[0]!.created_at
        },
        ...structuredResponse
      });

    } catch (error) {
      console.error('Generate AI plan error:', error);
      if (answerIfUnavailable(res, error)) return;

      // error.message.includes(...) throws here if error has no usable
      // .message -- unchanged from the original, which read error.message
      // the same way with no guard.
      const err = error as { message: string };
      if (err.message.includes('OpenAI API key')) {
        return res.status(500).json({ error: 'AI service not configured. Please set up OpenAI API key.' });
      }

      res.status(500).json({ error: 'Failed to generate AI plan' });
    }
  },

  // Parse AI response to extract structured data
  parseAIResponse(aiResponse: string | null): ParsedAiResponse {
    try {
      // Try to extract structured information from the AI response
      const analysis = aiResponse;

      // aiResponse can be null when the completion has no content; the
      // extract* helpers below assume a string, and their .split() throws a
      // TypeError on null -- which this try/catch is what actually turns
      // into the fallback response below. Unchanged from the original JS,
      // where this was implicit rather than declared.
      //
      // Extract recommendations (look for numbered lists or bullet points)
      const recommendations = aiController.extractRecommendations(aiResponse as string);

      // Extract action plan (look for action-oriented statements)
      const actionPlan = aiController.extractActionPlan(aiResponse as string);

      // Extract timeline estimate
      const estimatedTimeline = aiController.extractTimeline(aiResponse as string);

      // Extract risk factors
      const riskFactors = aiController.extractRiskFactors(aiResponse as string);

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
  extractRecommendations(response: string): string[] {
    const recommendations: string[] = [];
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
  extractActionPlan(response: string): string[] {
    const actionPlan: string[] = [];
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
  extractTimeline(response: string): string {
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
  extractRiskFactors(response: string): string[] {
    const riskFactors: string[] = [];
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
  async getUserFinancialData(userId: number): Promise<UserFinancialData | null> {
    try {
      // Get recent transactions (last 6 months)
      const sixMonthsAgo = new Date();
      sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

      const transactions = await query<TransactionRow>(
        'SELECT * FROM transactions WHERE user_id = $1 AND date >= $2 ORDER BY date DESC',
        [userId, sixMonthsAgo.toISOString().split('T')[0]]
      );

      // Get savings goals
      const goals = await query<{ name: string; target_amount: string; current_amount: string | null }>(
        'SELECT * FROM savings_goals WHERE user_id = $1',
        [userId]
      );

      // Calculate financial metrics
      const monthlyIncome = aiController.calculateMonthlyAverage(transactions.rows, 'income');
      const monthlyExpenses = aiController.calculateMonthlyAverage(transactions.rows, 'expense');
      // current_amount can be null; parseFloat coerces its argument to a
      // string internally, so String(...) here matches parseFloat(null)'s
      // existing NaN rather than silently defaulting to 0.
      const totalSavings = goals.rows.reduce((sum, goal) => sum + parseFloat(String(goal.current_amount)), 0);
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
          // goal.target_amount / current_amount are DECIMAL columns and
          // arrive as strings (see types/db.ts); GoalSummary types them
          // string (not number) for exactly this reason, since this summary
          // is only ever interpolated into a template literal in aiPlanner's
          // buildFinancialContext (`$${goal.current} / $${goal.target}`), and
          // passing the string through unchanged is what keeps '12.50' from
          // becoming '12.5'.
          target: goal.target_amount,
          current: goal.current_amount,
          // '/' coerces null to 0 and a numeric string to its number exactly
          // like Number() does -- this reproduces that coercion rather than
          // parseFloat's (which differs on trailing non-numeric characters).
          progress: (Number(goal.current_amount) / Number(goal.target_amount)) * 100
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
  calculateMonthlyAverage(transactions: TransactionRow[], type: TransactionType): number {
    const filteredTransactions = transactions.filter(t => t.type === type);
    if (filteredTransactions.length === 0) return 0;

    const total = filteredTransactions.reduce((sum, t) => sum + parseFloat(t.amount), 0);
    const months = aiController.getMonthCount(transactions);

    return months > 0 ? total / months : 0;
  },

  // Get number of months from transactions
  getMonthCount(transactions: TransactionRow[]): number {
    if (transactions.length === 0) return 0;

    // Month keys sort lexicographically, so min/max need no Date at all — and
    // going through one would shift a 1st-of-the-month into the month before.
    const months = transactions.map(t => monthOf(t.date)).filter((m): m is string => m !== null).sort();
    if (months.length === 0) return 0;

    // months.length === 0 already returned above, so the first and last
    // elements exist.
    return monthSpan(months[0]!, months[months.length - 1]!);
  },

  // Calculate spending by category
  calculateSpendingByCategory(transactions: TransactionRow[]): Record<string, number> {
    const categorySpending: Record<string, number> = {};

    transactions.forEach(transaction => {
      if (transaction.type === 'expense') {
        if (!categorySpending[transaction.category]) {
          categorySpending[transaction.category] = 0;
        }
        // The block above just ensured this key exists.
        categorySpending[transaction.category]! += parseFloat(transaction.amount);
      }
    });

    return categorySpending;
  },

  // Get user's AI plan history
  async getPlanHistory(req: Request, res: Response) {
    try {
      // No express-validator chain runs on this route, so these are read
      // exactly as the original code read them off req.query: untyped
      // strings when present, with page/limit defaulting only on undefined,
      // matching a destructuring default's own behaviour.
      const page = parseInt((req.query.page as string | undefined) ?? '1');
      const limit = parseInt((req.query.limit as string | undefined) ?? '10');
      const offset = (page - 1) * limit;

      const plans = await query<AiPlanRow>(
        'SELECT * FROM ai_plans WHERE user_id = $1 ORDER BY created_at DESC LIMIT $2 OFFSET $3',
        [req.user.userId, limit, offset]
      );

      const countResult = await query<{ count: string }>(
        'SELECT COUNT(*) FROM ai_plans WHERE user_id = $1',
        [req.user.userId]
      );

      // COUNT(*) with no GROUP BY always returns exactly one row.
      const totalCount = parseInt(countResult.rows[0]!.count);

      res.json({
        plans: plans.rows,
        pagination: {
          page,
          limit,
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
  async getPlan(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const plan = await query<AiPlanRow>(
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
  async generateBudgetRecommendations(req: Request, res: Response) {
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
      if (answerIfUnavailable(res, error)) return;
      res.status(500).json({ error: 'Failed to generate budget recommendations' });
    }
  },

  // Generate investment advice
  async generateInvestmentAdvice(req: Request, res: Response) {
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
      if (answerIfUnavailable(res, error)) return;
      res.status(500).json({ error: 'Failed to generate investment advice' });
    }
  }
};

export = aiController;
