const { validationResult } = require('express-validator');
const db = require('../db/connection');

const goalController = {
  // Get all goals for user
  async getGoals(req, res) {
    try {
      const goals = await db.query(
        'SELECT * FROM savings_goals WHERE user_id = $1 ORDER BY created_at DESC',
        [req.user.userId]
      );

      res.json({ goals: goals.rows });

    } catch (error) {
      console.error('Get goals error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Create new goal
  async createGoal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { name, target_amount, current_amount, target_date, description } = req.body;

      const newGoal = await db.query(
        'INSERT INTO savings_goals (user_id, name, target_amount, current_amount, target_date, description) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
        [req.user.userId, name, target_amount, current_amount || 0, target_date, description]
      );

      res.status(201).json({
        message: 'Goal created successfully',
        goal: newGoal.rows[0]
      });

    } catch (error) {
      console.error('Create goal error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update goal
  async updateGoal(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ errors: errors.array() });
      }

      const { id } = req.params;
      const { name, target_amount, current_amount, target_date, description } = req.body;

      // Check if goal belongs to user
      const existingGoal = await db.query(
        'SELECT id FROM savings_goals WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingGoal.rows.length === 0) {
        return res.status(404).json({ error: 'Goal not found' });
      }

      const updatedGoal = await db.query(
        'UPDATE savings_goals SET name = $1, target_amount = $2, current_amount = $3, target_date = $4, description = $5 WHERE id = $6 AND user_id = $7 RETURNING *',
        [name, target_amount, current_amount, target_date, description, id, req.user.userId]
      );

      res.json({
        message: 'Goal updated successfully',
        goal: updatedGoal.rows[0]
      });

    } catch (error) {
      console.error('Update goal error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Delete goal
  async deleteGoal(req, res) {
    try {
      const { id } = req.params;

      // Check if goal belongs to user
      const existingGoal = await db.query(
        'SELECT id FROM savings_goals WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingGoal.rows.length === 0) {
        return res.status(404).json({ error: 'Goal not found' });
      }

      await db.query(
        'DELETE FROM savings_goals WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      res.json({ message: 'Goal deleted successfully' });

    } catch (error) {
      console.error('Delete goal error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Update goal progress
  async updateProgress(req, res) {
    try {
      const { id } = req.params;
      const { current_amount } = req.body;

      // Check if goal belongs to user
      const existingGoal = await db.query(
        'SELECT id FROM savings_goals WHERE id = $1 AND user_id = $2',
        [id, req.user.userId]
      );

      if (existingGoal.rows.length === 0) {
        return res.status(404).json({ error: 'Goal not found' });
      }

      const updatedGoal = await db.query(
        'UPDATE savings_goals SET current_amount = $1 WHERE id = $2 AND user_id = $3 RETURNING *',
        [current_amount, id, req.user.userId]
      );

      res.json({
        message: 'Goal progress updated successfully',
        goal: updatedGoal.rows[0]
      });

    } catch (error) {
      console.error('Update progress error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  },

  // Get goal statistics
  async getGoalStats(req, res) {
    try {
      const goals = await db.query(
        'SELECT * FROM savings_goals WHERE user_id = $1',
        [req.user.userId]
      );

      const stats = {
        totalGoals: goals.rows.length,
        completedGoals: 0,
        totalTargetAmount: 0,
        totalCurrentAmount: 0,
        averageProgress: 0,
        goals: goals.rows
      };

      goals.rows.forEach(goal => {
        stats.totalTargetAmount += parseFloat(goal.target_amount);
        stats.totalCurrentAmount += parseFloat(goal.current_amount);
        
        if (parseFloat(goal.current_amount) >= parseFloat(goal.target_amount)) {
          stats.completedGoals += 1;
        }
      });

      if (stats.totalTargetAmount > 0) {
        stats.averageProgress = (stats.totalCurrentAmount / stats.totalTargetAmount) * 100;
      }

      res.json(stats);

    } catch (error) {
      console.error('Get goal stats error:', error);
      res.status(500).json({ error: 'Server error' });
    }
  }
};

module.exports = goalController; 