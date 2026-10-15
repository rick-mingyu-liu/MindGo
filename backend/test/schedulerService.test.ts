import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import scheduler = require('../services/schedulerService');
import logger = require('../utils/logger');
import db = require('../db/connection');
import config = require('../config');
import type { ScheduledTask } from 'node-cron';
import { spawnSync } from 'node:child_process';
import * as agentStore from '../services/agent/store';

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

describe('long refresh intervals', () => {
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
      scheduler.scheduleInterval('demoRefresh', 2592000000, async () => { runs++; return 0; });
      const entry = scheduler.jobs.get('demoRefresh');
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
    scheduler.scheduleInterval('demoRefresh', month, async () => { runs++; return 0; });
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
    scheduler.scheduleInterval('demoRefresh', month, async () => { runs++; return 0; });
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
    scheduler.scheduleInterval('demoRefresh', month, async () => {
      runs++;
      throw new Error('unavailable');
    });
    for (let cycle = 0; cycle < 2; cycle++) {
      mock.timers.tick(maximumDelay);
      mock.timers.tick(month - maximumDelay);
      await drain();
    }
    assert.equal(runs, 2);
    assert.deepEqual(errors, ['demoRefresh failed', 'demoRefresh failed']);
  });

  test('shutdown during an active refresh prevents rearming', async () => {
    let finish: (value: number) => void = () => {};
    let runs = 0;
    scheduler.scheduleInterval('demoRefresh', month, () => {
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
          ? { unverifiedAccounts: 1, agentData: null }
          : { unverifiedAccounts: null, agentData: 1 });
        mock.restoreAll();
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

describe('the demo refresh is opt-in', () => {
  /**
   * It deletes every row of the demo account before rewriting them. A
   * destructive job that mounts itself by default in whatever environment
   * happens to load this config is not something to opt out of.
   */
  const config: typeof import('../config') = require('../config');
  let saved: boolean;

  beforeEach(() => {
    saved = config.demo.refreshEnabled;
    mock.method(logger, 'audit', () => {});
    mock.method(logger, 'info', () => {});
  });

  afterEach(() => {
    config.demo.refreshEnabled = saved;
    scheduler.stop();
    mock.restoreAll();
  });

  test('is not mounted when DEMO_REFRESH_ENABLED is unset', () => {
    config.demo.refreshEnabled = false;
    scheduler.scheduleCleanupTasks();
    assert.equal(scheduler.jobs.has('demoRefresh'), false,
      'a destructive job mounted itself without being asked');
  });

  test('is mounted when it is turned on', () => {
    config.demo.refreshEnabled = true;
    scheduler.scheduleCleanupTasks();
    assert.equal(scheduler.jobs.has('demoRefresh'), true);
  });

  test('mounting it is audited, like the retention jobs', () => {
    const audits: string[] = [];
    mock.restoreAll();
    mock.method(logger, 'audit', (msg: string) => audits.push(msg));
    mock.method(logger, 'info', () => {});
    config.demo.refreshEnabled = true;

    scheduler.scheduleCleanupTasks();

    assert.ok(audits.some((line) => /Demo refresh scheduled/.test(line)),
      'nothing in the production log says the job is running');
  });

  test('rescheduling with it turned off removes an earlier one', () => {
    config.demo.refreshEnabled = true;
    scheduler.scheduleCleanupTasks();
    config.demo.refreshEnabled = false;
    scheduler.scheduleCleanupTasks();
    assert.equal(scheduler.jobs.has('demoRefresh'), false);
  });

  test('the retention jobs are unaffected either way', () => {
    for (const enabled of [false, true]) {
      config.demo.refreshEnabled = enabled;
      scheduler.scheduleCleanupTasks();
      assert.ok(scheduler.jobs.has('maintenance'));
      scheduler.stop();
    }
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
