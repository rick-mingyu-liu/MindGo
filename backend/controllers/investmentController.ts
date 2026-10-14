import { Request, Response } from 'express';
import { query } from '../db/connection';
import { errorSummary } from '../utils/errorSummary';

// Settings can still erase the user's archived watchlist rows.
const investmentController = {
  async clearAllWatchlist(req: Request, res: Response) {
    try {
      await query(
        'DELETE FROM watchlist WHERE user_id = $1',
        [req.user.userId]
      );

      res.json({ message: 'All watchlist items cleared successfully' });

    } catch (error) {
      console.error('Clear watchlist error:', { userId: req.user.userId, ...errorSummary(error) });
      res.status(500).json({ error: 'Server error' });
    }
  }
};

export = investmentController;
