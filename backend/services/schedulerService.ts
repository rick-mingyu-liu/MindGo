import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config = require('../config');
import logger = require('../utils/logger');
import { query } from '../db/connection';
import { sendWeeklyReport, generateWeeklyReport } from './emailService';
import * as cleanupService from './cleanupService';
import * as demoAccountService from './demoAccountService';

// name -> { job, kind }. `kind` is what tells stop() and getStatus() which
// API they are holding; the two types share no methods worth guessing at.
type Job =
  | { job: NodeJS.Timeout; kind: 'interval' }
  | { job: ScheduledTask; kind: 'cron' };

/**
 * Owns the two kinds of recurring work: a node-cron job for weekly reports, and
 * plain intervals for the retention deletions.
 *
 * The two are not interchangeable, which is what the old `stop()` got wrong —
 * see the comment there.
 */
class SchedulerService {
  jobs: Map<string, Job>;

  constructor() {
    this.jobs = new Map();
  }

  // Initialize all scheduled jobs
  init(): void {
    this.scheduleWeeklyReports();
    this.scheduleCleanupTasks();
    logger.info('Scheduler service initialized');
  }

  /**
   * Runs an async task on an interval, and actually reports its failures.
   *
   * The shape this replaces was:
   *
   *     setInterval(() => {
   *       try { doAsyncThing(); logger.debug('completed'); }
   *       catch (e) { logger.error(e); }
   *     }, ms);
   *
   * which cannot work. `doAsyncThing()` returns a promise, so the try block
   * exits before the work finishes: the catch is unreachable for anything the
   * task rejects with, and "completed" is logged the instant the task *starts*.
   * Awaiting inside an async callback is what makes both lines mean what they
   * say.
   *
   * unref() so a retention timer never keeps the process alive on its own. The
   * pool's inactivity timer in db/connection.ts had exactly this problem, where
   * it silently held the test runner open.
   */
  scheduleInterval(name: string, intervalMs: number, task: () => Promise<number>): void {
    const timer = setInterval(async () => {
      try {
        const deleted = await task();
        const line = `${name}: deleted ${deleted} row(s)`;
        // Only a real deletion is an audit event. These intervals fire 432
        // times a day between them and almost always delete nothing; routing
        // the zeros through audit too would bury the lines that matter in a
        // production log. The zero case stays on the dev-only channel, where
        // it is still useful for watching the schedule tick.
        if (deleted > 0) {
          logger.audit(line);
        } else {
          logger.info(line);
        }
      } catch (error) {
        logger.error(`${name} failed`, error);
      }
    }, intervalMs);

    timer.unref();
    this.jobs.set(name, { job: timer, kind: 'interval' });
  }

  // Schedule weekly report emails
  scheduleWeeklyReports(): void {
    // node-cron must be 4.6 or later: 4.2 computed the next Sunday as 2034 and
    // slept until then (test/schedulerService.test.ts).
    const job = cron.schedule(config.cron.weeklyReports, async () => {
      try {
        logger.info('Starting weekly report generation...');

        // query() is generic, but it cannot infer a row shape from a SQL
        // string, so the shape is named here; this lists only the columns the
        // SELECT names.
        const users = await query(
          'SELECT id, email FROM users WHERE email_notifications_enabled = true AND weekly_reports_enabled = true'
        ) as { rows: Array<{ id: number; email: string }> };

        let successCount = 0;
        let errorCount = 0;

        for (const user of users.rows) {
          try {
            const report = await generateWeeklyReport(user.id);
            await sendWeeklyReport(user.email, report.text, report.html);
            successCount++;
            // Was `${user.email}`. The rule from item 16: log a user id where
            // one exists. The SELECT above already fetches it.
            logger.info(`Weekly report sent to user ${user.id}`);
          } catch (error) {
            errorCount++;
            logger.error(`Failed to send weekly report to user ${user.id}`, error);
          }
        }

        logger.info(`Weekly reports completed: ${successCount} successful, ${errorCount} failed`);
      } catch (error) {
        logger.error('Error in weekly report scheduler', error);
      }
    }, { timezone: config.cron.timezone });

    this.jobs.set('weeklyReports', { job, kind: 'cron' });
    logger.info('Weekly reports scheduled');
  }

  // Schedule cleanup tasks
  scheduleCleanupTasks(): void {
    this.scheduleInterval(
      'aiCleanup',
      config.cron.aiPlanCleanup,
      // cleanupService returns the row count pg's DELETE reports, typed
      // number | null because that is how @types/pg types it in general; a
      // DELETE always reports one, so this is a no-op coercion in practice,
      // same as `deleted += null` coercing to a no-op in the pre-TypeScript
      // version of this arithmetic.
      () => cleanupService.deleteOldAIPlans().then((count) => count ?? 0)
    );

    this.scheduleInterval(
      'accountCleanup',
      config.cron.unverifiedAccountCleanup,
      () => cleanupService.deleteUnverifiedAccounts().then((count) => count ?? 0)
    );

    // The demo refresh is opt-in. It deletes every row of the demo account
    // before rewriting them, and it identifies that account by `is_demo`
    // rather than by an email address anyone could register — see
    // demoAccountService. It never creates the account, so on a database with
    // nothing flagged it is a no-op that says so.
    if (config.demo.refreshEnabled) {
      this.scheduleInterval(
        'demoRefresh',
        config.cron.demoRefresh,
        () => demoAccountService.refreshDemoAccountOnSchedule()
      );
      logger.audit(`Demo refresh scheduled: every ${config.cron.demoRefresh}ms`);
    }

    // Audit rather than info: with the zero-row runs silent in production, a
    // log with no [AUDIT] deletion lines in it is ambiguous between "nothing
    // needed deleting" and "the jobs were never mounted". This one line at boot
    // separates the two.
    logger.audit(
      `Retention jobs scheduled: aiCleanup every ${config.cron.aiPlanCleanup}ms, ` +
      `accountCleanup every ${config.cron.unverifiedAccountCleanup}ms`
    );
  }

  /**
   * Stops every job.
   *
   * The previous version tried `job.stop?.()` then `job.destroy?.()` and gave
   * up if it found neither — which is precisely what happens for a Timeout,
   * since `setInterval` returns an object with no `stop` and no `destroy`. It
   * then logged "Stopped scheduled job: aiCleanup" for a job that was still
   * running. Only `process.exit(0)` on the line after the SIGTERM handler's
   * call kept that from mattering.
   */
  stop(): void {
    for (const [name, entry] of this.jobs) {
      if (entry.kind === 'interval') {
        clearInterval(entry.job);
      } else {
        entry.job.stop();
      }
      logger.info(`Stopped scheduled job: ${name}`);
    }
    this.jobs.clear();
  }

  /**
   * Not called anywhere today; kept because it is the natural body of a health
   * endpoint. It previously read `job.running` and `job.nextDate()`, neither of
   * which exists on either job type under node-cron 4 — so it reported every
   * job as active with a null next run, including jobs that had been stopped.
   *
   * `stop()` clears the map, so presence in it is what "scheduled" means.
   */
  getStatus(): Record<string, { kind: 'interval' | 'cron'; scheduled: true; nextRun: string | null }> {
    const status: Record<string, { kind: 'interval' | 'cron'; scheduled: true; nextRun: string | null }> = {};
    for (const [name, entry] of this.jobs) {
      status[name] = {
        kind: entry.kind,
        scheduled: true,
        nextRun: entry.kind === 'cron' ? (entry.job.getNextRun()?.toISOString() ?? null) : null,
      };
    }
    return status;
  }
}

export = new SchedulerService();
