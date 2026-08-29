const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const logger = require('../utils/logger');

/**
 * The logger's contract, which until now was only implied by its callers.
 *
 * `enabled` is `NODE_ENV === 'development'`, snapshotted on the singleton at
 * construction. Setting it directly here is the faithful way to test the
 * production shape: it is the one thing production actually changes.
 *
 * The property that matters is `audit`: it must print with `enabled` false,
 * because the retention jobs destroy user data unattended and a record of that
 * is worth having in the environment where it actually happens (item 17).
 */
describe('logger', () => {
  let out;
  let saved;

  beforeEach(() => {
    out = [];
    saved = logger.enabled;
    mock.method(console, 'log', (...a) => out.push(['log', ...a]));
    mock.method(console, 'warn', (...a) => out.push(['warn', ...a]));
    mock.method(console, 'error', (...a) => out.push(['error', ...a]));
  });

  afterEach(() => {
    logger.enabled = saved;
    mock.restoreAll();
  });

  const text = () => out.map((a) => a.map(String).join(' ')).join('\n');

  describe('in production, where console logging is off', () => {
    beforeEach(() => { logger.enabled = false; });

    test('audit still prints', () => {
      logger.audit('accountCleanup: deleted 3 row(s)');
      assert.match(text(), /\[AUDIT\].*accountCleanup: deleted 3 row\(s\)/);
    });

    test('error still prints', () => {
      logger.error('accountCleanup failed', new Error('boom'));
      assert.match(text(), /\[ERROR\].*accountCleanup failed/);
    });

    test('info, warn and debug stay silent', () => {
      logger.info('routine');
      logger.warn('routine');
      logger.debug('routine');
      assert.equal(out.length, 0, `expected silence, got: ${text()}`);
    });
  });

  describe('in development', () => {
    beforeEach(() => { logger.enabled = true; });

    test('audit prints here too — it is unconditional, not inverted', () => {
      logger.audit('accountCleanup: deleted 3 row(s)');
      assert.match(text(), /\[AUDIT\]/);
    });

    test('info prints', () => {
      logger.info('routine');
      assert.match(text(), /\[INFO\].*routine/);
    });
  });

  describe('audit line shape', () => {
    beforeEach(() => { logger.enabled = false; });

    test('carries an ISO timestamp, so a deletion can be placed in time', () => {
      logger.audit('anything');
      assert.match(text(), /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z/);
    });

    test('prints a data payload when given one', () => {
      logger.audit('accountCleanup', { deleted: 3 });
      assert.match(text(), /"deleted": 3/);
    });

    test('prints nothing extra when not', () => {
      logger.audit('accountCleanup');
      assert.equal(out.length, 1);
    });
  });
});
