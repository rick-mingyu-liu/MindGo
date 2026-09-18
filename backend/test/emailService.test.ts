import { test, describe, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import db = require('../db/connection');
import { generateWeeklyReport } from '../services/emailService';

/**
 * `generateWeeklyReport` returns `{ text, html }` on every path but one: a
 * user with no transactions in the past 7 days got back a bare string
 * instead. Both callers destructure `report.text` / `report.html`
 * unconditionally (controllers/authController.js's `/auth/test-email` and
 * schedulerService's Sunday job), so that user's email went out with
 * `text: undefined, html: undefined` — the "No transactions found" message
 * written for exactly this case has never reached anyone.
 *
 * No database: db.query is mocked to return zero rows for every call, which
 * is what a quiet week looks like.
 */

describe('generateWeeklyReport, with no transactions in the past 7 days', () => {
  beforeEach(() => {
    mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));
  });

  afterEach(() => mock.restoreAll());

  test('returns the same { text, html } shape as every other path', async () => {
    const report = await generateWeeklyReport(1);

    assert.equal(typeof report, 'object', 'returned a bare string instead of { text, html }');
    assert.match(report.text, /No transactions found in the past 7 days/);
    assert.ok(report.html && report.html.length > 0, 'html was empty or missing');
  });
});
