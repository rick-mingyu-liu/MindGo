import { test, describe, before, after, mock } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import util from 'node:util';

/**
 * Verification tokens must not reach the request log.
 *
 * Runs the real app.ts, so its actual morgan setup is what is exercised: a
 * GET /auth/verify-email/<token> whose Referer is the frontend page
 * /verify-email?token=<token> — exactly what a browser sends when it follows
 * an emailed link — and asserts the access-log line has neither token but
 * still has everything else 'combined' would print.
 *
 * Also covers the one other place a token was printed: sendEmailVerification
 * logged the full verification URL with console.log, which prints in
 * production.
 *
 * No database, no SMTP: db.query answers "no such token", and nodemailer's
 * transport is replaced before emailService is first loaded. A dummy
 * DATABASE_URL keeps dotenv from loading the real one in .env.
 */
process.env.DATABASE_URL = 'postgres://request-logging-test.invalid/none';
process.env.JWT_SECRET = crypto.randomBytes(32).toString('hex');
process.env.NODE_ENV = 'test';

const TOKEN = crypto.randomBytes(32).toString('hex');
const REFERER_TOKEN = crypto.randomBytes(32).toString('hex');

describe('request log', () => {
  let request: typeof import('supertest');
  let app: typeof import('../app');
  let written: string[];
  let restoreWrite: () => void;

  before(() => {
    request = require('supertest');
    app = require('../app');
    const db: typeof import('../db/connection') = require('../db/connection');
    mock.method(db, 'query', async () => ({ rows: [], rowCount: 0 }));
    mock.method(console, 'log', () => {});

    // morgan writes to process.stdout; record what it writes, and pass it on.
    // The test runner reports over the same stream, so lines are found by the
    // access-log request field, never by a bare path.
    written = [];
    const original = process.stdout.write.bind(process.stdout);
    process.stdout.write = ((chunk: string | Uint8Array, ...rest: never[]) => {
      written.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8'));
      return original(chunk, ...rest);
    }) as typeof process.stdout.write;
    restoreWrite = () => { process.stdout.write = original; };
  });
  after(() => {
    restoreWrite();
    mock.restoreAll();
  });

  test('GET /auth/verify-email/<token> with a token-bearing Referer logs neither token', async () => {
    const res = await request(app)
      .get(`/auth/verify-email/${TOKEN}`)
      .set('Referer', `https://mind-go.vercel.app/verify-email?token=${REFERER_TOKEN}`)
      .set('User-Agent', 'request-logging-test/1.0');
    assert.equal(res.status, 400);
    // morgan logs when the response finishes; let that callback run.
    await new Promise((resolve) => setImmediate(resolve));

    const line = written.find((w) => w.includes('"GET /auth/verify-email/'));
    assert.ok(line, `no access-log line was written; saw ${util.inspect(written)}`);
    assert.ok(!line.includes(TOKEN), 'the path token reached the log');
    assert.ok(!line.includes(REFERER_TOKEN), 'the Referer token reached the log');
    assert.ok(!written.some((w) => w.includes(TOKEN) || w.includes(REFERER_TOKEN)), 'a token was written elsewhere');

    // Still the 'combined' line: method, redacted path, protocol, status,
    // referrer origin and page, user agent.
    assert.match(line, /"GET \/auth\/verify-email\/\[redacted\] HTTP\/1\.1" 400 /);
    assert.match(line, /"https:\/\/mind-go\.vercel\.app\/verify-email\?token=\[redacted\]"/);
    assert.match(line, /"request-logging-test\/1\.0"\n$/);
    assert.match(line, /^\S+ - - \[\d{2}\/\w{3}\/\d{4}:\d{2}:\d{2}:\d{2} \+0000\] /);
  });

  test('an ordinary request is logged unchanged', async () => {
    await request(app).get('/health?probe=1');
    await new Promise((resolve) => setImmediate(resolve));
    const line = written.find((w) => w.includes('"GET /health'));
    assert.ok(line);
    assert.match(line, /"GET \/health\?probe=1 HTTP\/1\.1" 200 \d+ "-" /);
  });
});

describe('sendEmailVerification logging', () => {
  test('does not print the verification URL or token', async () => {
    const nodemailer: typeof import('nodemailer') = require('nodemailer');
    const sent: unknown[] = [];
    mock.method(nodemailer, 'createTransport', () => ({ sendMail: async (m: unknown) => { sent.push(m); } }));
    const path = require.resolve('../services/emailService');
    delete require.cache[path];
    const { sendEmailVerification }: typeof import('../services/emailService') = require(path);

    const printed: unknown[][] = [];
    for (const level of ['log', 'info', 'warn', 'error', 'debug'] as const) {
      mock.method(console, level, (...args: unknown[]) => { printed.push(args); });
    }
    try {
      await sendEmailVerification('john.doe@example.com', 'John', TOKEN);
    } finally {
      mock.restoreAll();
      delete require.cache[path];
    }

    assert.equal(sent.length, 1, 'the email was not sent through the stub');
    assert.ok(util.inspect(sent).includes(TOKEN), 'the email itself must still carry the link');
    assert.ok(!printed.some((args) => util.inspect(args).includes(TOKEN)), `the token was logged: ${util.inspect(printed)}`);
  });
});
