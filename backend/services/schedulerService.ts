import cron from 'node-cron';
import type { ScheduledTask } from 'node-cron';
import config = require('../config');
import logger = require('../utils/logger');
import { query } from '../db/connection';
import { sendWeeklyReport, generateWeeklyReport } from './emailService';
import * as cleanupService from './cleanupService';
import * as demoAccountService from './demoAccountService';
import { cleanupAgentData } from './agent/store';

// name -> { job, kind }. `kind` is what tells stop() and getStatus() which
// API they are holding; the two types share no methods worth guessing at.
type Job =
  | { job: NodeJS.Timeout; kind: 'interval'; cancel: () => void; nextRun: () => Date | null }
  | { job: ScheduledTask; kind: 'cron' };

const MAX_TIMER_DELAY = 2_147_483_647;

/** What one maintenance run did with each cleanup. A failed one is `null`. */
interface MaintenanceResult {
  unverifiedAccounts: number | null;
  agentData?: number | null;
  /** Rows deleted by a demo refresh; 0 when the data was fresh or there is no demo account. */
  demoRefresh?: number | null;
}

/**
 * Owns the two kinds of recurring work: a node-cron job for weekly reports, and
 * a self-rearming timer for the hourly maintenance sweep (which also carries
 * the opt-in demo refresh).
 *
 * The two are not interchangeable, which is what the old `stop()` got wrong —
 * see the comment there.
 */
class SchedulerService {
  jobs: Map<string, Job>;
  private maintenanceRun: Promise<MaintenanceResult> | null;

  constructor() {
    this.jobs = new Map();
    this.maintenanceRun = null;
  }

  // Initialize all scheduled jobs
  init(): void {
    this.scheduleWeeklyReports();
    this.scheduleCleanupTasks();
    logger.info('Scheduler service initialized');
  }

  /**
   * Runs an async task every `intervalMs`, and actually reports its failures.
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
   * It is a chain of timeouts, not a setInterval, for three reasons:
   * - The next run is armed only after the current one settles, so a slow run
   *   can never overlap the next.
   * - The first run is one full interval after scheduling, never at startup,
   *   and missed runs are not replayed: after a suspended process wakes, it
   *   runs once and starts a fresh interval.
   * - Node clamps delays beyond ~24.9 days to 1ms. An interval that long waits
   *   in bounded chunks rather than becoming a rapid loop. (Nothing schedules
   *   one today: the demo refresh used to be a 30-day interval, and since the
   *   clock restarted on every deploy it never ran. It is now a staleness
   *   check inside the hourly maintenance run.)
   *
   * A task that returns a number is reporting rows deleted, logged here; one
   * that returns nothing does its own logging (maintenance reports each
   * cleanup separately).
   *
   * unref() so a retention timer never keeps the process alive on its own. The
   * pool's inactivity timer in db/connection.ts had exactly this problem, where
   * it silently held the test runner open.
   */
  scheduleInterval(name: string, intervalMs: number, task: () => Promise<number | void>): void {
    // Rescheduling a name replaces its chain rather than running two.
    this.cancel(name);

    const run = async (): Promise<void> => {
      try {
        const deleted = await task();
        if (typeof deleted === 'number') logDeleted(name, deleted);
      } catch (error) {
        logger.error(`${name} failed`, error);
      }
    };

    let cancelled = false;
    let running = false;
    let due = Date.now() + intervalMs;
    const entry: Extract<Job, { kind: 'interval' }> = {
      kind: 'interval',
      job: setTimeout(wake, Math.min(intervalMs, MAX_TIMER_DELAY)),
      cancel: () => {
        cancelled = true;
        clearTimeout(entry.job);
      },
      // Unknown while a run is in flight: the next one is armed when it ends.
      nextRun: () => (running ? null : new Date(due)),
    };
    entry.job.unref();
    this.jobs.set(name, entry);

    function arm(): void {
      if (cancelled) return;
      entry.job = setTimeout(wake, Math.min(Math.max(1, due - Date.now()), MAX_TIMER_DELAY));
      entry.job.unref();
    }

    async function wake(): Promise<void> {
      if (cancelled) return;
      if (Date.now() < due) {
        arm();
        return;
      }
      running = true;
      await run();
      running = false;
      due = Date.now() + intervalMs;
      arm();
    }
  }

  /**
   * One maintenance sweep: the unverified-account deletion, then agent
   * housekeeping when that feature is enabled, then the demo refresh when
   * that is enabled and the demo data is stale.
   *
   * Each is attempted whatever happened to the others, so a failing account
   * cleanup never leaves expired agent data in place or a stale demo, and the
   * reverse. A call made while a sweep is still running joins that sweep
   * instead of starting a second one.
   */
  runMaintenance(): Promise<MaintenanceResult> {
    if (!this.maintenanceRun) {
      this.maintenanceRun = (async () => ({
        unverifiedAccounts: await attempt('accountCleanup', cleanupService.deleteUnverifiedAccounts),
        // Agent tables are queried only after the feature/migration is enabled.
        // Share the existing hourly wake-up; never add a keep-alive interval.
        ...(config.agent.enabled ? {agentData: await attempt('agentCleanup', cleanupAgentData)} : {}),
        // Staleness, not a timer: one SELECT per run decides, so a deploy
        // never resets when the next refresh is due. Rides this existing
        // hourly wake-up for the same Neon reason as above.
        ...(config.demo.refreshEnabled
          ? {demoRefresh: await attempt('demoRefresh', () => demoAccountService.refreshDemoAccountIfStale())}
          : {}),
      }))().finally(() => {
        this.maintenanceRun = null;
      });
    }
    return this.maintenanceRun;
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

  // Schedule the hourly maintenance sweep
  scheduleCleanupTasks(): void {
    this.scheduleInterval('maintenance', config.cron.maintenance, async () => {
      await this.runMaintenance();
    });

    // The demo refresh is opt-in and runs inside the sweep above. It deletes
    // every row of the demo account before rewriting them, and it identifies
    // that account by `is_demo` rather than by an email address anyone could
    // register — see demoAccountService. It never creates the account, so on a
    // database with nothing flagged it is a no-op that says so once.
    const demo = config.demo.refreshEnabled
      ? `, demoRefresh when the newest demo transaction is over ${config.demo.staleDays} day(s) old`
      : '';

    // Audit rather than info: with the zero-row runs silent in production, a
    // log with no [AUDIT] deletion lines in it is ambiguous between "nothing
    // needed deleting" and "the jobs were never mounted". This one line at boot
    // separates the two.
    logger.audit(
      `Retention jobs scheduled: maintenance (accountCleanup${demo}) every ${config.cron.maintenance}ms, ` +
      'first run one interval from now'
    );
  }

  /** Cancels one job, if it is scheduled. */
  private cancel(name: string): void {
    const entry = this.jobs.get(name);
    if (!entry) return;
    if (entry.kind === 'interval') entry.cancel();
    else entry.job.stop();
    this.jobs.delete(name);
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
    for (const name of [...this.jobs.keys()]) {
      this.cancel(name);
      logger.info(`Stopped scheduled job: ${name}`);
    }
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
        nextRun: entry.kind === 'cron'
          ? (entry.job.getNextRun()?.toISOString() ?? null)
          : (entry.nextRun()?.toISOString() ?? null),
      };
    }
    return status;
  }
}

/**
 * Only a real deletion is an audit event. The sweep almost always deletes
 * nothing; routing the zeros through audit too would bury the lines that
 * matter in a production log. The zero case stays on the dev-only channel,
 * where it is still useful for watching the schedule tick.
 */
function logDeleted(name: string, deleted: number): void {
  const line = `${name}: deleted ${deleted} row(s)`;
  if (deleted > 0) {
    logger.audit(line);
  } else {
    logger.info(line);
  }
}

/** Runs one cleanup, logs its outcome, and returns its count (null if it failed). */
async function attempt(name: string, cleanup: () => Promise<number | null>): Promise<number | null> {
  try {
    // pg types rowCount as number | null; a DELETE always reports one.
    const deleted = (await cleanup()) ?? 0;
    logDeleted(name, deleted);
    return deleted;
  } catch (error) {
    logger.error(`${name} failed`, error);
    return null;
  }
}

export = new SchedulerService();
