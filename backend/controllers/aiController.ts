import { Request, Response } from 'express';
import { query } from '../db/connection';
import { errorSummary } from '../utils/errorSummary';
import config = require('../config');
import { aiPlanIsLive } from '../services/cleanupService';
import type { AiPlanRow } from '../types/db';

// Legacy history remains readable only for its original retention window.
const aiController = {
  // Get user's AI plan history
  async getPlanHistory(req: Request, res: Response) {
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
      const limit = (req.query.limit as string | undefined) ?? '10';
      const offset = (Number(page) - 1) * Number(limit);

      const plans = await query<AiPlanRow>(
        `SELECT * FROM ai_plans WHERE user_id = $1 AND ${aiPlanIsLive(4)} ORDER BY created_at DESC LIMIT $2 OFFSET $3`,
        [req.user.userId, parseInt(limit), offset, config.dataRetention.aiPlanMinutes]
      );

      const countResult = await query<{ count: string }>(
        `SELECT COUNT(*) FROM ai_plans WHERE user_id = $1 AND ${aiPlanIsLive(2)}`,
        [req.user.userId, config.dataRetention.aiPlanMinutes]
      );

      // COUNT(*) with no GROUP BY always returns exactly one row.
      const totalCount = parseInt(countResult.rows[0]!.count);

      res.json({
        plans: plans.rows,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total: totalCount,
          pages: Math.ceil(totalCount / Number(limit))
        }
      });

    } catch (error) {
      console.error('Get plan history error:', { userId: req.user.userId, ...errorSummary(error) });
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get specific AI plan
  async getPlan(req: Request, res: Response) {
    try {
      const { id } = req.params;

      const plan = await query<AiPlanRow>(
        `SELECT * FROM ai_plans WHERE id = $1 AND user_id = $2 AND ${aiPlanIsLive(3)}`,
        [id, req.user.userId, config.dataRetention.aiPlanMinutes]
      );

      if (plan.rows.length === 0) {
        return res.status(404).json({ error: 'Plan not found' });
      }

      res.json({ plan: plan.rows[0] });

    } catch (error) {
      console.error('Get plan error:', { userId: req.user.userId, ...errorSummary(error) });
      res.status(500).json({ error: 'Server error' });
    }
  }
};

export = aiController;
