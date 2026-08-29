const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const scheduler = require('../services/schedulerService');
const logger = require('../utils/logger');

/**
 * Tests for the interval plumbing, not for what the cleanups delete — that is
 * cleanupService.test.js.
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
const drain = () => new Promise((resolve) => setImmediate(resolve));

describe('scheduleInterval', () => {
  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setInterval'] });
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
    const errors = [];
    mock.method(logger, 'error', (msg) => errors.push(msg));
    const infos = [];
    mock.method(logger, 'info', (msg) => infos.push(msg));

    scheduler.scheduleInterval('test', 1000, async () => {
      throw new Error('database is down');
    });

    mock.timers.tick(1000);
    await drain();

    assert.equal(errors.length, 1);
    assert.match(errors[0], /test failed/);
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
    const logged = [];
    mock.method(logger, 'audit', (msg) => logged.push(msg));
    mock.method(logger, 'info', (msg) => logged.push(msg));

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
    // db/connection.js's inactivity timer had this exact problem: it kept the
    // test runner alive with no output at all until it was unref'd.
    mock.method(logger, 'info', () => {});
    scheduler.jobs.clear();

    scheduler.scheduleInterval('test', 60_000, async () => 0);

    assert.equal(scheduler.jobs.get('test').job.hasRef(), false);
  });
});

describe('stop', () => {
  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setInterval'] });
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
    const stopped = [];
    scheduler.jobs.set('weeklyReports', {
      job: { stop: () => stopped.push('weeklyReports') },
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
    mock.timers.enable({ apis: ['setInterval'] });
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
    assert.equal(scheduler.getStatus().test.scheduled, true);

    scheduler.stop();

    assert.deepEqual(scheduler.getStatus(), {});
  });

  test('reads the next run from the node-cron 4 API', () => {
    const when = new Date('2030-01-01T00:00:00.000Z');
    scheduler.jobs.set('weeklyReports', {
      job: { getNextRun: () => when, stop: () => {} },
      kind: 'cron',
    });

    assert.equal(scheduler.getStatus().weeklyReports.nextRun, when.toISOString());
  });

  test('an interval has no next run to report', () => {
    scheduler.scheduleInterval('test', 1000, async () => 0);
    assert.equal(scheduler.getStatus().test.nextRun, null);
  });
});

describe('what the retention jobs report', () => {
  // Decision D. The counts used to go through logger.info, which is gated on
  // NODE_ENV === 'development', so in production the record of what these jobs
  // deleted did not exist. Errors always printed, so a *failing* cleanup was
  // visible and a *successful* one was not.
  beforeEach(() => {
    scheduler.jobs.clear();
    mock.timers.enable({ apis: ['setInterval'] });
  });

  afterEach(() => {
    mock.timers.reset();
    mock.restoreAll();
  });

  async function runOnce(rowCount) {
    const audits = [];
    const infos = [];
    mock.method(logger, 'audit', (msg) => audits.push(msg));
    mock.method(logger, 'info', (msg) => infos.push(msg));

    scheduler.scheduleInterval('accountCleanup', 1000, async () => rowCount);
    mock.timers.tick(1000);
    await drain();

    return { audits, infos };
  }

  test('a real deletion is an audit event', async () => {
    const { audits, infos } = await runOnce(3);
    assert.equal(audits.length, 1);
    assert.match(audits[0], /accountCleanup: deleted 3 row\(s\)/);
    assert.equal(infos.length, 0);
  });

  test('a run that deleted nothing is not', async () => {
    // These two intervals fire 432 times a day between them and almost always
    // delete nothing. Auditing the zeros would bury the lines that matter.
    const { audits, infos } = await runOnce(0);
    assert.equal(audits.length, 0);
    assert.equal(infos.length, 1);
    assert.match(infos[0], /deleted 0 row\(s\)/);
  });

  test('the count reaches the console in production, end to end', async () => {
    // The point of the whole change, asserted through the real logger rather
    // than a mock of it: with console logging off, the deletion still prints.
    const printed = [];
    const savedEnabled = logger.enabled;
    logger.enabled = false;
    mock.method(console, 'log', (...a) => printed.push(a.map(String).join(' ')));

    scheduler.scheduleInterval('accountCleanup', 1000, async () => 7);
    mock.timers.tick(1000);
    await drain();

    logger.enabled = savedEnabled;
    assert.match(printed.join('\n'), /\[AUDIT\].*accountCleanup: deleted 7 row\(s\)/);
  });

  test('scheduling the jobs is itself audited, so an idle log is not ambiguous', async () => {
    // With zero-row runs silent, a production log containing no deletion lines
    // cannot otherwise be told apart from one where the jobs never mounted.
    const audits = [];
    mock.method(logger, 'audit', (msg) => audits.push(msg));
    mock.method(logger, 'info', () => {});

    scheduler.scheduleCleanupTasks();

    assert.equal(audits.length, 1);
    assert.match(audits[0], /aiCleanup/);
    assert.match(audits[0], /accountCleanup/);
  });
});
