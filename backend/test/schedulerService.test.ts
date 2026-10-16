import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import scheduler = require('../services/schedulerService');
import logger = require('../utils/logger');
import db = require('../db/connection');
import config = require('../config');
import type { ScheduledTask } from 'node-cron';
import { spawnSync } from 'node:child_process';
import * as agentStore from '../services/agent/store';
import * as demoAccountService from '../services/demoAccountService';
import * as retentionService from '../services/retentionService';

/**
 * Tests for the interval plumbing, not for what the cleanups delete — that is
 * cleanupService.test.ts.
 *
 * Every case here is a bug that was actually present. The scheduler is the part
 * of this app nobody watches: it has no request to fail, no user to complain,
 * and its previous version reported success for work that had not run and
 * reported "stopped" for jobs that were still running. So the assertions are
 * about the machinery rather than the SQL.
 *
 * Timers are mocked, so nothing here waits on wall-clock time.
 */

// Lets the awaits inside the interval callback settle after a tick.
const drain = (): Promise<void> => new Promise((resolve) => setImmediate(resolve));

describe('long intervals', () => {
  const month = 2_592_000_000;
  const maximumDelay = 2_147_483_647;

  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    mock.method(logger, 'info', () => {});
    mock.method(logger, 'audit', () => {});
  });
  afterEach(() => {
    scheduler.stop();
    mock.timers.reset();
    mock.restoreAll();
  });

  test('real Node timers do not turn a month into an immediate refresh', () => {
    // Fake timers accept oversized delays; a real child catches Node's clamp
    // to 1ms without ever calling the database or waiting a month.
    const result = spawnSync(process.execPath, ['-e', `
      const scheduler = require(${JSON.stringify(require.resolve('../services/schedulerService'))});
      let runs = 0;
      scheduler.scheduleInterval('longJob', 2592000000, async () => { runs++; return 0; });
      const entry = scheduler.jobs.get('longJob');
      const referenced = entry.job.hasRef();
      setTimeout(() => {
        scheduler.stop();
        process.exit(runs === 0 && !referenced ? 0 : 1);
      }, 30);
    `], { encoding: 'utf8', timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    assert.doesNotMatch(result.stderr, /TimeoutOverflowWarning/);
  });

  test('waits the full month across timer boundaries and repeats', async () => {
    let runs = 0;
    scheduler.scheduleInterval('longJob', month, async () => { runs++; return 0; });
    for (let cycle = 1; cycle <= 2; cycle++) {
      mock.timers.tick(maximumDelay);
      await drain();
      assert.equal(runs, cycle - 1);
      mock.timers.tick(month - maximumDelay - 1);
      await drain();
      assert.equal(runs, cycle - 1);
      mock.timers.tick(1);
      await drain();
      assert.equal(runs, cycle);
    }
  });

  test('shutdown cancels a later chunk', async () => {
    let runs = 0;
    scheduler.scheduleInterval('longJob', month, async () => { runs++; return 0; });
    mock.timers.tick(maximumDelay);
    await drain();
    scheduler.stop();
    mock.timers.tick(month);
    await drain();
    assert.equal(runs, 0);
    assert.deepEqual(scheduler.getStatus(), {});
  });

  test('a failed refresh is logged and the next month still runs', async () => {
    let runs = 0;
    const errors: string[] = [];
    mock.method(logger, 'error', (message: string) => errors.push(message));
    scheduler.scheduleInterval('longJob', month, async () => {
      runs++;
      throw new Error('unavailable');
    });
    for (let cycle = 0; cycle < 2; cycle++) {
      mock.timers.tick(maximumDelay);
      mock.timers.tick(month - maximumDelay);
      await drain();
    }
    assert.equal(runs, 2);
    assert.deepEqual(errors, ['longJob failed', 'longJob failed']);
  });

  test('shutdown during an active refresh prevents rearming', async () => {
    let finish: (value: number) => void = () => {};
    let runs = 0;
    scheduler.scheduleInterval('longJob', month, () => {
      runs++;
      return new Promise<number>((resolve) => { finish = resolve; });
    });
    mock.timers.tick(maximumDelay);
    mock.timers.tick(month - maximumDelay);
    scheduler.stop();
    finish(0);
    await drain();
    mock.timers.tick(month);
    await drain();
    assert.equal(runs, 1);
  });
});

describe('scheduleInterval', () => {
  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  test('runs the task on each interval', async () => {
    let runs = 0;
    scheduler.scheduleInterval('test', 1000, async () => { runs += 1; return 0; });

    mock.timers.tick(1000);
    await drain();
    mock.timers.tick(1000);
    await drain();

    assert.equal(runs, 2);
  });

  test('logs a failing task as an error rather than reporting success', async () => {
    // The old shape was `try { task(); logger.debug('completed') } catch {}`
    // around a promise-returning call. The catch was unreachable and the
    // success line fired the instant the task *started*, so a cleanup that
    // threw every single time looked healthy in the log.
    const errors: string[] = [];
    mock.method(logger, 'error', (msg: string) => errors.push(msg));
    const infos: string[] = [];
    mock.method(logger, 'info', (msg: string) => infos.push(msg));

    scheduler.scheduleInterval('test', 1000, async () => {
      throw new Error('database is down');
    });

    mock.timers.tick(1000);
    await drain();

    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /test failed/);
    assert.equal(infos.filter((m) => /deleted/.test(m)).length, 0);
  });

  test('a rejecting task does not take the process down or stop the schedule', async () => {
    let runs = 0;
    mock.method(logger, 'error', () => {});
    scheduler.scheduleInterval('test', 1000, async () => {
      runs += 1;
      throw new Error('transient');
    });

    mock.timers.tick(1000);
    await drain();
    mock.timers.tick(1000);
    await drain();

    assert.equal(runs, 2, 'a failed run must not cancel the interval');
  });

  test('logs the row count the task reports', async () => {
    // Moved from logger.info to logger.audit by decision D so it survives
    // NODE_ENV=production; which channel, and why, is asserted in "what the
    // retention jobs report" below. What this one still pins is that the
    // number logged is the number the task returned.
    const logged: string[] = [];
    mock.method(logger, 'audit', (msg: string) => logged.push(msg));
    mock.method(logger, 'info', (msg: string) => logged.push(msg));

    scheduler.scheduleInterval('aiCleanup', 1000, async () => 42);

    mock.timers.tick(1000);
    await drain();

    assert.ok(logged.some((m) => /aiCleanup: deleted 42 row\(s\)/.test(m)), logged.join(' | '));
  });

});

describe('scheduleInterval, on a real timer', () => {
  // mock.timers' fake Timeout ignores unref() — hasRef() stays true however it
  // is called — so this one property can only be checked against a real timer.
  afterEach(() => {
    scheduler.stop();
    mock.restoreAll();
  });

  test('does not hold the event loop open', () => {
    // db/connection.ts's inactivity timer had this exact problem: it kept the
    // test runner alive with no output at all until it was unref'd.
    mock.method(logger, 'info', () => {});
    scheduler.jobs.clear();

    scheduler.scheduleInterval('test', 60_000, async () => 0);

    const entry = scheduler.jobs.get('test');
    assert.ok(entry && entry.kind === 'interval', 'test was not registered as an interval job');
    assert.equal(entry.job.hasRef(), false);
  });
});

describe('stop', () => {
  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    mock.method(logger, 'info', () => {});
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  test('actually stops an interval job', async () => {
    // It did not. setInterval returns a Timeout, which has neither stop() nor
    // destroy(), so the old loop fell through both branches and logged
    // "Stopped scheduled job" for a job that kept firing.
    let runs = 0;
    scheduler.scheduleInterval('test', 1000, async () => { runs += 1; return 0; });

    mock.timers.tick(1000);
    await drain();
    assert.equal(runs, 1);

    scheduler.stop();

    mock.timers.tick(5000);
    await drain();
    assert.equal(runs, 1, 'the interval kept running after stop()');
  });

  test('stops a cron job through its own API', () => {
    const stopped: string[] = [];
    // Only stop() is exercised by scheduler.stop() for a cron job; the rest of
    // ScheduledTask's two dozen methods are irrelevant to this fake.
    const fakeCronJob = { stop: () => { stopped.push('weeklyReports'); } } as unknown as ScheduledTask;
    scheduler.jobs.set('weeklyReports', {
      job: fakeCronJob,
      kind: 'cron',
    });

    scheduler.stop();

    assert.deepEqual(stopped, ['weeklyReports']);
  });

  test('empties the job registry', () => {
    scheduler.scheduleInterval('test', 1000, async () => 0);
    scheduler.stop();
    assert.equal(scheduler.jobs.size, 0);
  });
});

describe('getStatus', () => {
  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    mock.method(logger, 'info', () => {});
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  test('reports a stopped job as gone, not as active', () => {
    // The old version read job.running, which is undefined on both job types,
    // so `job.running !== false` reported every job as active forever.
    scheduler.scheduleInterval('test', 1000, async () => 0);
    assert.equal(scheduler.getStatus().test!.scheduled, true);

    scheduler.stop();

    assert.deepEqual(scheduler.getStatus(), {});
  });

  test('reads the next run from the node-cron 4 API', () => {
    const when = new Date('2030-01-01T00:00:00.000Z');
    // getNextRun() is the only ScheduledTask method getStatus() calls for a
    // cron job; the rest of the interface is irrelevant to this fake.
    const fakeCronJob = { getNextRun: () => when, stop: () => {} } as unknown as ScheduledTask;
    scheduler.jobs.set('weeklyReports', {
      job: fakeCronJob,
      kind: 'cron',
    });

    assert.equal(scheduler.getStatus().weeklyReports!.nextRun, when.toISOString());
  });

  test('an interval reports when it runs next', () => {
    const start = Date.now();
    scheduler.scheduleInterval('test', 1000, async () => 0);
    assert.equal(scheduler.getStatus().test!.nextRun, new Date(start + 1000).toISOString());
  });
});

describe('what the retention jobs report', () => {
  // Decision D. The counts used to go through logger.info, which is gated on
  // NODE_ENV === 'development', so in production the record of what these jobs
  // deleted did not exist. Errors always printed, so a *failing* cleanup was
  // visible and a *successful* one was not.
  let savedDemo: boolean;

  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    // The boot audit line below counts lines; a DEMO_REFRESH_ENABLED in the
    // environment would add a second one.
    savedDemo = config.demo.refreshEnabled;
    config.demo.refreshEnabled = false;
  });

  afterEach(() => {
    scheduler.stop();
    config.demo.refreshEnabled = savedDemo;
    mock.timers.reset();
    mock.restoreAll();
  });

  async function runOnce(rowCount: number): Promise<{ audits: string[]; infos: string[] }> {
    const audits: string[] = [];
    const infos: string[] = [];
    mock.method(logger, 'audit', (msg: string) => audits.push(msg));
    mock.method(logger, 'info', (msg: string) => infos.push(msg));

    scheduler.scheduleInterval('accountCleanup', 1000, async () => rowCount);
    mock.timers.tick(1000);
    await drain();

    return { audits, infos };
  }

  test('a real deletion is an audit event', async () => {
    const { audits, infos } = await runOnce(3);
    assert.equal(audits.length, 1);
    assert.match(audits[0]!, /accountCleanup: deleted 3 row\(s\)/);
    assert.equal(infos.length, 0);
  });

  test('a run that deleted nothing is not', async () => {
    // The sweep almost always deletes nothing. Auditing the zeros would bury
    // the lines that matter.
    const { audits, infos } = await runOnce(0);
    assert.equal(audits.length, 0);
    assert.equal(infos.length, 1);
    assert.match(infos[0]!, /deleted 0 row\(s\)/);
  });

  test('the count reaches the console in production, end to end', async () => {
    // The point of the whole change, asserted through the real logger rather
    // than a mock of it: with console logging off, the deletion still prints.
    const printed: string[] = [];
    const savedEnabled = logger.enabled;
    logger.enabled = false;
    mock.method(console, 'log', (...a: unknown[]) => printed.push(a.map(String).join(' ')));

    scheduler.scheduleInterval('accountCleanup', 1000, async () => 7);
    mock.timers.tick(1000);
    await drain();

    logger.enabled = savedEnabled;
    assert.match(printed.join('\n'), /\[AUDIT\].*accountCleanup: deleted 7 row\(s\)/);
  });

  test('a maintenance run audits each cleanup that deleted rows, in production too', async () => {
    // The real job does not return a count for scheduleInterval to log; each
    // cleanup is logged by itself. Asserted through the real logger with
    // console logging off, as production runs it.
    const printed: string[] = [];
    const savedEnabled = logger.enabled;
    logger.enabled = false;
    mock.method(console, 'log', (...a: unknown[]) => printed.push(a.map(String).join(' ')));
    mock.method(db, 'query', async () => ({ rowCount: 2, rows: [] }));

    await scheduler.runMaintenance();

    logger.enabled = savedEnabled;
    const log = printed.join('\n');
    assert.match(log, /\[AUDIT\].*accountCleanup: deleted 2 row\(s\)/);
  });

  test('a maintenance run that deleted nothing stays off the production log', async () => {
    const audits: string[] = [];
    mock.method(logger, 'audit', (msg: string) => audits.push(msg));
    mock.method(logger, 'info', () => {});
    mock.method(db, 'query', async () => ({ rowCount: 0, rows: [] }));

    await scheduler.runMaintenance();

    assert.deepEqual(audits, []);
  });

  test('scheduling the jobs is itself audited, so an idle log is not ambiguous', async () => {
    // With zero-row runs silent, a production log containing no deletion lines
    // cannot otherwise be told apart from one where the jobs never mounted.
    const audits: string[] = [];
    mock.method(logger, 'audit', (msg: string) => audits.push(msg));
    mock.method(logger, 'info', () => {});

    scheduler.scheduleCleanupTasks();

    assert.equal(audits.length, 1);
    assert.match(audits[0]!, /maintenance/);
    assert.doesNotMatch(audits[0]!, /aiPlan/);
    assert.match(audits[0]!, /accountCleanup/);
    assert.match(audits[0]!, new RegExp(`every ${config.cron.maintenance}ms`));
  });
});

describe('hourly maintenance', () => {
  /**
   * The retention deletions share one hourly sweep. They used to run every 5
   * and 10 minutes, which left Neon (suspends after ~5 idle minutes) almost no
   * window to scale to zero. These pin what the sweep may and may not do to
   * the database: db.query is mocked, and every call to it is a query Neon
   * would have had to wake up for.
   */
  const hour = config.cron.maintenance;
  let sql: string[];
  let errors: string[];
  let savedDemo: boolean;

  beforeEach(() => {
    savedDemo = config.demo.refreshEnabled;
    config.demo.refreshEnabled = false;
    scheduler.jobs.clear();
    sql = [];
    errors = [];
    mock.timers.enable({ apis: ['setTimeout', 'Date'] });
    mock.method(logger, 'info', () => {});
    mock.method(logger, 'audit', () => {});
    mock.method(logger, 'error', (message: string) => errors.push(message));
    // The transaction retention step has its own describe below; here it
    // stands aside so the query counts stay about the account cleanup.
    mock.method(retentionService, 'deleteExpiredTransactions', async () => 0);
  });

  afterEach(() => {
    scheduler.stop();
    config.demo.refreshEnabled = savedDemo;
    mock.timers.reset();
    mock.restoreAll();
  });

  function answer(handler: (text: string) => Promise<{ rowCount: number; rows: [] }>): void {
    mock.method(db, 'query', (text: string) => {
      sql.push(text);
      return handler(text);
    });
  }
  const deletesFrom = (table: string) => sql.filter((text) => new RegExp(`^DELETE FROM ${table}\\b`).test(text)).length;

  test('is one hourly job', () => {
    scheduler.scheduleCleanupTasks();
    assert.equal(hour, 60 * 60 * 1000);
    assert.deepEqual([...scheduler.jobs.keys()], ['maintenance']);
  });

  test('queries nothing at startup or before the first hour is up', async () => {
    answer(async () => ({ rowCount: 0, rows: [] }));
    scheduler.scheduleCleanupTasks();
    await drain();
    mock.timers.tick(hour - 1);
    await drain();
    assert.deepEqual(sql, []);
  });

  test('runs the account cleanup once an hour, and nothing else while the agent is off', async () => {
    answer(async () => ({ rowCount: 0, rows: [] }));
    scheduler.scheduleCleanupTasks();
    mock.timers.tick(hour);
    await drain();
    assert.equal(sql.length, 1);
    assert.equal(deletesFrom('users'), 1);

    mock.timers.tick(hour);
    await drain();
    assert.equal(sql.length, 2);
  });

  test('a failing cleanup does not stop the other one', async () => {
    // Agent housekeeping is the other cleanup in the sweep; it runs only
    // while the feature is enabled, so enable it and stand in for its store.
    const savedAgent = config.agent.enabled;
    config.agent.enabled = true;
    try {
      for (const failing of ['agent', 'users']) {
        sql = [];
        errors = [];
        let agentCalls = 0;
        answer(async (text) => {
          if (failing === 'users' && text.startsWith('DELETE FROM users')) throw new Error('connection terminated');
          return { rowCount: 1, rows: [] };
        });
        mock.method(agentStore, 'cleanupAgentData', async () => {
          agentCalls++;
          if (failing === 'agent') throw new Error('connection terminated');
          return 1;
        });
        const result = await scheduler.runMaintenance();
        assert.equal(agentCalls, 1, `agent cleanup skipped when ${failing} failed`);
        assert.equal(deletesFrom('users'), 1, `users skipped when ${failing} failed`);
        assert.deepEqual(errors, [failing === 'agent' ? 'agentCleanup failed' : 'accountCleanup failed']);
        assert.deepEqual(result, failing === 'agent'
          ? { unverifiedAccounts: 1, agentData: null, transactionRetention: 0 }
          : { unverifiedAccounts: null, agentData: 1, transactionRetention: 0 });
        mock.restoreAll();
        mock.method(retentionService, 'deleteExpiredTransactions', async () => 0);
        mock.method(logger, 'info', () => {});
        mock.method(logger, 'audit', () => {});
        mock.method(logger, 'error', (message: string) => errors.push(message));
      }
    } finally {
      config.agent.enabled = savedAgent;
    }
  });

  test('a slow run is never overlapped by the next', async () => {
    let release: () => void = () => {};
    answer((text) => text.startsWith('DELETE FROM users')
      ? new Promise((resolve) => { release = () => resolve({ rowCount: 0, rows: [] }); })
      : Promise.resolve({ rowCount: 0, rows: [] }));
    scheduler.scheduleCleanupTasks();

    mock.timers.tick(hour);
    await drain();
    // Stuck on the first query for five more hours: nothing new starts.
    for (let i = 0; i < 5; i++) {
      mock.timers.tick(hour);
      await drain();
    }
    assert.equal(deletesFrom('users'), 1);

    // A direct call during the run joins it rather than starting another.
    const joined = scheduler.runMaintenance();
    await drain();
    assert.equal(deletesFrom('users'), 1);

    release();
    await joined;
    await drain();

    // The next run is a full hour after this one finished.
    mock.timers.tick(hour - 1);
    await drain();
    assert.equal(deletesFrom('users'), 1);
    mock.timers.tick(1);
    await drain();
    assert.equal(deletesFrom('users'), 2);

    // Let that second run finish: the scheduler is a singleton, and a run left
    // hanging here would be joined by every later test's runMaintenance().
    release();
    await drain();
    await drain();
  });

  test('missed hours are not replayed after downtime', async () => {
    // A suspended or stalled process wakes up with several hours overdue: one
    // sweep, then a fresh hour, not a burst of catch-up runs.
    answer(async () => ({ rowCount: 0, rows: [] }));
    scheduler.scheduleCleanupTasks();
    mock.timers.tick(6 * hour);
    await drain();
    assert.equal(deletesFrom('users'), 1);
    mock.timers.tick(hour - 1);
    await drain();
    assert.equal(deletesFrom('users'), 1);
  });

  test('stop() cancels future runs', async () => {
    answer(async () => ({ rowCount: 0, rows: [] }));
    scheduler.scheduleCleanupTasks();
    mock.timers.tick(hour);
    await drain();
    assert.equal(sql.length, 1);

    scheduler.stop();
    mock.timers.tick(10 * hour);
    await drain();
    assert.equal(sql.length, 1);
    assert.deepEqual(scheduler.getStatus(), {});
  });

  test('scheduling twice replaces the job instead of running two', async () => {
    answer(async () => ({ rowCount: 0, rows: [] }));
    scheduler.scheduleCleanupTasks();
    scheduler.scheduleCleanupTasks();
    mock.timers.tick(hour);
    await drain();
    assert.equal(sql.length, 1);
  });

  test('reports no next run while one is in flight', async () => {
    let release: () => void = () => {};
    answer(() => new Promise((resolve) => { release = () => resolve({ rowCount: 0, rows: [] }); }));
    scheduler.scheduleCleanupTasks();
    mock.timers.tick(hour);
    await drain();
    assert.equal(scheduler.getStatus().maintenance!.nextRun, null);

    // Drain the cleanup; then the next run is an hour from now.
    release();
    await drain();
    await drain();
    assert.equal(scheduler.getStatus().maintenance!.nextRun, new Date(Date.now() + hour).toISOString());
  });

  test('reports when it runs next', () => {
    const start = Date.now();
    scheduler.scheduleCleanupTasks();
    assert.deepEqual(scheduler.getStatus().maintenance, {
      kind: 'interval',
      scheduled: true,
      nextRun: new Date(start + hour).toISOString(),
    });
  });
});

describe('the demo refresh rides the hourly maintenance run', () => {
  /**
   * It used to be its own 30-day interval. scheduleInterval's first run is one
   * interval after scheduling and the clock restarts with the process, so on a
   * host that redeploys several times a day it never ran and the demo went
   * stale. Now each maintenance run asks one question — how long ago was the
   * last refresh? — and refreshes only when the answer is too long.
   *
   * db.query stands in for PostgreSQL: it answers the staleness SELECT by
   * computing MIN(created_at) over a fake set of demo rows against the mocked
   * clock, as the real statement does (test/demoFreshnessDb.test.ts runs the
   * real one). The refresh's own transaction runs on a fake client from
   * getPool(), so `connects` counts refreshes, and its COMMIT replaces the
   * fake rows with rows created now.
   */
  const hour = config.cron.maintenance;
  const day = 24 * hour;
  const today = '2026-10-15';
  let sql: string[];
  let params: unknown[][];
  let clientSql: string[];
  let errors: string[];
  let audits: string[];
  let connects: number;
  // The demo account's transactions, as their created_at in ms; null = no demo user.
  let demo: { id: number; createdAt: number[] } | null;
  let refreshFails: boolean;
  let usersFails: boolean;
  let savedDemo: boolean;
  let savedAgent: boolean;

  const refreshedDaysAgo = (days: number, rows = 3): number[] =>
    Array.from({ length: rows }, () => Date.now() - days * day);

  beforeEach(() => {
    savedDemo = config.demo.refreshEnabled;
    savedAgent = config.agent.enabled;
    config.demo.refreshEnabled = true;
    config.agent.enabled = false;
    scheduler.jobs.clear();
    demoAccountService.resetAbsenceReport();
    mock.timers.enable({ apis: ['setTimeout', 'Date'], now: Date.parse(`${today}T12:00:00.000Z`) });
    sql = [];
    params = [];
    clientSql = [];
    errors = [];
    audits = [];
    connects = 0;
    demo = { id: 42, createdAt: refreshedDaysAgo(30) };
    refreshFails = false;
    usersFails = false;
    mock.method(logger, 'info', () => {});
    mock.method(logger, 'audit', (message: string) => audits.push(message));
    mock.method(logger, 'error', (message: string) => errors.push(message));
    mock.method(db, 'query', async (text: string, values?: unknown[]) => {
      sql.push(text.replace(/\s+/g, ' ').trim());
      params.push(values ?? []);
      if (usersFails && text.startsWith('DELETE FROM users')) throw new Error('connection terminated');
      if (/MIN\(t\.created_at\)/.test(text)) {
        if (!demo) return { rows: [], rowCount: 0 };
        const limitDays = Number(values?.[0]);
        const oldest = demo.createdAt.length ? Math.min(...demo.createdAt) : null;
        const stale = oldest === null || oldest < Date.now() - limitDays * day;
        return { rows: [{ id: demo.id, refreshed_at: oldest === null ? null : new Date(oldest).toISOString(), stale }], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const client = {
      query: async (text: string) => {
        clientSql.push(text.replace(/\s+/g, ' ').trim());
        if (/SELECT id FROM users WHERE is_demo/.test(text)) {
          return { rows: demo ? [{ id: demo.id }] : [], rowCount: demo ? 1 : 0 };
        }
        if (/^\s*DELETE FROM/.test(text)) return { rows: [], rowCount: 3 };
        // The rewrite: every row is replaced by one created now.
        if (text === 'COMMIT' && demo) demo.createdAt = refreshedDaysAgo(0, 5);
        return { rows: [], rowCount: 0 };
      },
      release: () => {},
    };
    mock.method(retentionService, 'deleteExpiredTransactions', async () => 0);
    mock.method(db, 'getPool', () => ({
      connect: async () => {
        connects++;
        if (refreshFails) throw new Error('connection terminated');
        return client;
      },
    }));
  });

  afterEach(() => {
    scheduler.stop();
    config.demo.refreshEnabled = savedDemo;
    config.agent.enabled = savedAgent;
    mock.timers.reset();
    mock.restoreAll();
  });

  const demoQueries = (): string[] => sql.filter((text) => /is_demo|transactions/.test(text));
  const deletesFromUsers = (): number => sql.filter((text) => text.startsWith('DELETE FROM users')).length;

  test('is still one hourly job, and the boot line says the refresh is in it', () => {
    scheduler.scheduleCleanupTasks();
    assert.deepEqual([...scheduler.jobs.keys()], ['maintenance']);
    assert.equal(audits.length, 1);
    assert.match(audits[0]!, /demoRefresh/);
    assert.match(audits[0]!, new RegExp(`${config.demo.staleDays} day`));
  });

  test('flag off: no demo query at all', async () => {
    config.demo.refreshEnabled = false;
    const result = await scheduler.runMaintenance();
    assert.deepEqual(demoQueries(), []);
    assert.equal(connects, 0);
    assert.equal('demoRefresh' in result, false);
    assert.equal(deletesFromUsers(), 1);
  });

  test('stale: refreshed once, and the deletion is audited', async () => {
    const result = await scheduler.runMaintenance();
    assert.equal(connects, 1);
    assert.ok(clientSql.includes('COMMIT'));
    assert.equal(result.demoRefresh, 6);
    assert.ok(audits.some((line) => /demoRefresh: deleted 6 row\(s\)/.test(line)), audits.join(' | '));
  });

  test('the staleness check is one SELECT, scoped by is_demo and never by email, with the limit in days', async () => {
    await scheduler.runMaintenance();
    const [check, ...rest] = demoQueries();
    assert.equal(rest.length, 0);
    assert.match(check!, /^SELECT /);
    assert.match(check!, /WHERE u\.is_demo = TRUE/);
    assert.doesNotMatch(check!, /email/i);
    assert.deepEqual(params[sql.indexOf(check!)], [config.demo.staleDays]);
  });

  test('a demo account with no transactions is stale', async () => {
    demo = { id: 42, createdAt: [] };
    await scheduler.runMaintenance();
    assert.equal(connects, 1);
  });

  test('fresh: no refresh, and nothing beyond the one SELECT', async () => {
    demo = { id: 42, createdAt: refreshedDaysAgo(config.demo.staleDays - 1) };
    const result = await scheduler.runMaintenance();
    assert.equal(connects, 0);
    assert.equal(result.demoRefresh, 0);
    const others = sql.filter((text) => !text.startsWith('DELETE FROM users'));
    assert.equal(others.length, 1);
    assert.match(others[0]!, /^SELECT /);
  });

  test('a visitor row added today does not postpone a refresh that is due', async () => {
    // The demo login is public. A row dated (and created) today must not count
    // as a refresh, or anyone adding one regularly would block it for ever.
    demo = { id: 42, createdAt: [...refreshedDaysAgo(config.demo.staleDays + 1), Date.now()] };
    await scheduler.runMaintenance();
    assert.equal(connects, 1);
  });

  test('no demo user: no write, and the error is logged once per process', async () => {
    demo = null;
    for (let run = 0; run < 3; run++) {
      const result = await scheduler.runMaintenance();
      assert.equal(result.demoRefresh, 0);
    }
    assert.equal(connects, 0);
    assert.ok(!sql.some((text) => /^(INSERT|UPDATE|DELETE FROM (transactions|savings_goals))/.test(text)));
    assert.equal(errors.length, 1);
    assert.match(errors[0]!, /is_demo/);
    assert.match(errors[0]!, /db:seed/);
  });

  test('a failed refresh does not stop the account cleanup, and is reported like the others', async () => {
    refreshFails = true;
    const result = await scheduler.runMaintenance();
    assert.equal(deletesFromUsers(), 1);
    assert.deepEqual(errors, ['demoRefresh failed']);
    assert.deepEqual(result, { unverifiedAccounts: 0, demoRefresh: null, transactionRetention: 0 });
  });

  test('failed cleanups do not stop the refresh', async () => {
    usersFails = true;
    config.agent.enabled = true;
    mock.method(agentStore, 'cleanupAgentData', async () => { throw new Error('connection terminated'); });
    const result = await scheduler.runMaintenance();
    assert.equal(connects, 1);
    assert.deepEqual(errors, ['accountCleanup failed', 'agentCleanup failed']);
    assert.deepEqual(result, { unverifiedAccounts: null, agentData: null, demoRefresh: 6, transactionRetention: 0 });
  });

  test('runs within an hour of any boot, and a fresh rewrite is not refreshed again the next hour', async () => {
    // A redeploy restarts the clock; with a staleness check that costs at most
    // an hour, not the whole interval.
    scheduler.scheduleCleanupTasks();
    scheduler.stop();
    scheduler.scheduleCleanupTasks();
    mock.timers.tick(hour);
    await drain();
    await drain();
    assert.equal(connects, 1);

    mock.timers.tick(hour);
    await drain();
    await drain();
    assert.equal(connects, 1);
    assert.equal(sql.filter((text) => /is_demo/.test(text)).length, 2);
  });
});

describe('DEMO_REFRESH_STALE_DAYS', () => {
  // Read once at load, so each value is checked in a fresh process.
  const staleDaysWith = (value: string | undefined): number => {
    const env = { ...process.env };
    if (value === undefined) delete env.DEMO_REFRESH_STALE_DAYS;
    else env.DEMO_REFRESH_STALE_DAYS = value;
    const result = spawnSync(process.execPath, ['-e',
      `process.stdout.write(String(require(${JSON.stringify(require.resolve('../config'))}).demo.staleDays))`,
    ], { encoding: 'utf8', env, timeout: 5000 });
    assert.equal(result.status, 0, result.stderr);
    return Number(result.stdout);
  };

  test('defaults to 14, honours a larger value, and is never below 7', () => {
    assert.equal(staleDaysWith(undefined), 14);
    assert.equal(staleDaysWith('30'), 30);
    assert.equal(staleDaysWith('7'), 7);
    assert.equal(staleDaysWith('3'), 7);
    assert.equal(staleDaysWith('1'), 7);
    assert.equal(staleDaysWith('0'), 14); // not a positive integer: the default
  });
});

describe('scheduleWeeklyReports', () => {
  // Real node-cron, on a UTC clock like the production host. node-cron 4.2
  // answered "Sunday 19:00" with 2034-01-01, and its runner sleeps until that
  // answer, so the weekly email never went out; and without a timezone the
  // cron ran at 19:00 server time, 3 p.m. in Toronto.
  const originalTz = process.env.TZ;
  beforeEach(() => {
    process.env.TZ = 'UTC';
    scheduler.jobs.clear();
  });
  afterEach(() => {
    scheduler.stop();
    process.env.TZ = originalTz;
    if (originalTz === undefined) delete process.env.TZ;
  });

  test('next runs this coming Sunday at 7 p.m. Toronto time', () => {
    scheduler.scheduleWeeklyReports();
    const entry = scheduler.jobs.get('weeklyReports');
    assert.ok(entry && entry.kind === 'cron', 'weeklyReports was not registered as a cron job');
    const next = entry.job.getNextRun()!;

    const daysAway = (next.getTime() - Date.now()) / 86400000;
    assert.ok(daysAway > 0 && daysAway <= 7, `next run ${next.toISOString()}`);

    const parts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Toronto', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(next).map(({ type, value }) => [type, value]));
    assert.deepEqual([parts.weekday, parts.hour, parts.minute], ['Sun', '19', '00']);
  });
});
