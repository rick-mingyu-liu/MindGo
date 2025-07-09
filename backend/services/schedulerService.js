const cron = require('node-cron');
const config = require('../config');
const logger = require('../utils/logger');
const db = require('../db/connection');
const { sendWeeklyReport, generateWeeklyReport } = require('./emailService');
const authController = require('../controllers/authController');
const aiController = require('../controllers/aiController');

class SchedulerService {
  constructor() {
    this.jobs = new Map();
  }

  // Initialize all scheduled jobs
  init() {
    this.scheduleWeeklyReports();
    this.scheduleCleanupTasks();
    logger.info('Scheduler service initialized');
  }

  // Schedule weekly report emails
  scheduleWeeklyReports() {
    const job = cron.schedule(config.cron.weeklyReports, async () => {
      try {
        logger.info('Starting weekly report generation...');
        
        const users = await db.query(
          'SELECT id, email FROM users WHERE email_notifications_enabled = true AND weekly_reports_enabled = true'
        );
        
        let successCount = 0;
        let errorCount = 0;
        
        for (const user of users.rows) {
          try {
            const report = await generateWeeklyReport(user.id);
            await sendWeeklyReport(user.email, report.text, report.html);
            successCount++;
            logger.info(`Weekly report sent to ${user.email}`);
          } catch (error) {
            errorCount++;
            logger.error(`Failed to send weekly report to ${user.email}`, error);
          }
        }
        
        logger.info(`Weekly reports completed: ${successCount} successful, ${errorCount} failed`);
      } catch (error) {
        logger.error('Error in weekly report scheduler', error);
      }
    });

    this.jobs.set('weeklyReports', job);
    logger.info('Weekly reports scheduled');
  }

  // Schedule cleanup tasks
  scheduleCleanupTasks() {
    // Clean up old AI plans
    const aiCleanupJob = setInterval(() => {
      try {
        aiController.autoDeleteOldAIPlans();
        logger.debug('AI plans cleanup completed');
      } catch (error) {
        logger.error('Error in AI plans cleanup', error);
      }
    }, config.cron.aiPlanCleanup);

    // Clean up unverified accounts
    const accountCleanupJob = setInterval(() => {
      try {
        authController.deleteUnverifiedAccounts();
        logger.debug('Unverified accounts cleanup completed');
      } catch (error) {
        logger.error('Error in unverified accounts cleanup', error);
      }
    }, config.cron.unverifiedAccountCleanup);

    this.jobs.set('aiCleanup', aiCleanupJob);
    this.jobs.set('accountCleanup', accountCleanupJob);
    logger.info('Cleanup tasks scheduled');
  }

  // Stop all scheduled jobs
  stop() {
    for (const [name, job] of this.jobs) {
      if (job.stop) {
        job.stop();
      } else if (job.destroy) {
        job.destroy();
      }
      logger.info(`Stopped scheduled job: ${name}`);
    }
    this.jobs.clear();
  }

  // Get status of all jobs
  getStatus() {
    const status = {};
    for (const [name, job] of this.jobs) {
      status[name] = {
        active: job.running !== false,
        nextRun: job.nextDate ? job.nextDate().toISOString() : null
      };
    }
    return status;
  }
}

module.exports = new SchedulerService(); 