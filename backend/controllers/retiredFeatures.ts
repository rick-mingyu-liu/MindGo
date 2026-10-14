import type { Request, Response } from 'express';

export function investmentsRetired(_req: Request, res: Response): void {
  res.status(410).json({
    error: 'Stock and watchlist features have been retired.',
    code: 'investments_retired',
  });
}

export function aiPlanningRetired(_req: Request, res: Response): void {
  res.status(410).json({
    error: 'One-shot AI planning has been retired.',
    code: 'ai_planning_retired',
  });
}
