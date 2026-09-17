const { test, describe, before, after, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const util = require('node:util');
const express = require('express');

// Before config is loaded: these tests send more requests than the default
// per-user budget.
process.env.RATE_LIMIT_IMPORT_MAX = '10000';

const config = require('../config');
const db = require('../db/connection');

/**
 * `POST /import/parse` and `POST /transactions/import`, through the real
 * routers on a real server, with auth and the database stubbed.
 *
 * Real routers rather than the validation chains alone, for the reason
 * autoDeleteValidation.test.js gives: the failure worth guarding against is a
 * validator that exists but is not mounted. And the body of every request here
 * is, in production, the text of someone's bank screenshot — so each suite
 * also asserts that none of it reached the log.
 */

const authPath = require.resolve('../middleware/auth');
const importRouterPath = require.resolve('../routes/import');
const transactionsRouterPath = require.resolve('../routes/transactions');

let server;
let baseUrl;
let queries;
let printed;
let existing;

before(async () => {
  require.cache[authPath] = {
    id: authPath,
    filename: authPath,
    loaded: true,
    exports: (req, _res, next) => { req.user = { userId: 7 }; next(); },
  };
  delete require.cache[importRouterPath];
  delete require.cache[transactionsRouterPath];

  // Mirrors app.js: /import gets its own, larger body limit first.
  const app = express();
  app.use('/import', express.json({ limit: config.import.bodyLimit }));
  app.use(express.json());
  app.use('/import', require(importRouterPath));
  app.use('/transactions', require(transactionsRouterPath));

  server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

after(async () => {
  await new Promise((resolve) => server.close(resolve));
  delete require.cache[authPath];
  delete require.cache[importRouterPath];
  delete require.cache[transactionsRouterPath];
});

beforeEach(() => {
  queries = [];
  printed = [];
  existing = [];
  mock.method(db, 'query', async (text, params) => {
    queries.push({ text, params });
    if (/^SELECT date, amount, currency/.test(text)) return { rows: existing };
    if (/INSERT INTO transactions/.test(text)) {
      return { rows: params.filter((_, i) => i % 8 === 0).slice(0, -1).map((_, i) => ({ id: 100 + i })) };
    }
    return { rows: [] };
  });
  for (const method of ['log', 'error', 'warn', 'info']) {
    mock.method(console, method, (...args) => printed.push(args));
  }
});

afterEach(() => mock.restoreAll());

const post = (path, body) => fetch(`${baseUrl}${path}`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: typeof body === 'string' ? body : JSON.stringify(body),
});

const output = () => printed
  .map((args) => args.map((a) => (typeof a === 'string' ? a : util.inspect(a, { depth: 6 }))).join(' '))
  .join('\n');

const ocrLine = (text, x, y, conf = 0.99) => ({ text, conf, box: { x, y, width: text.length * 16, height: 40 } });
const screenshot = (overrides = {}) => ({
  today: '2026-09-16',
  model: 'PP-OCRv5_en_mobile',
  image: { width: 1170, height: 2532 },
  lines: [
    ocrLine('Sep 14', 20, 0),
    ocrLine('SECRETMERCHANT', 20, 60), ocrLine('-$23.47', 600, 60),
    ocrLine('PAYROLL', 20, 120), ocrLine('+$1,250.00', 600, 120),
    ocrLine('COFFEE', 20, 180), ocrLine('-$4.25', 600, 180),
  ],
  ...overrides,
});

describe('POST /import/parse', () => {
  test('returns draft rows and stores nothing', async () => {
    const res = await post('/import/parse', screenshot());
    assert.equal(res.status, 200);
    const body = await res.json();
    assert.equal(body.layout, 'bank-list');
    assert.equal(body.model, 'PP-OCRv5_en_mobile');
    assert.deepEqual(body.rows.map((r) => [r.description, r.amount, r.type, r.date]), [
      ['SECRETMERCHANT', '23.47', 'expense', '2026-09-14'],
      ['PAYROLL', '1250.00', 'income', '2026-09-14'],
      ['COFFEE', '4.25', 'expense', '2026-09-14'],
    ]);
    assert.ok(queries.every((q) => /^SELECT/.test(q.text)), 'parse wrote to the database');
  });

  test('flags a row the user already has', async () => {
    existing = [{ date: '2026-09-14', amount: '4.25', currency: 'CAD' }];
    const body = await (await post('/import/parse', screenshot())).json();
    const coffee = body.rows.find((r) => r.description === 'COFFEE');
    assert.ok(coffee.flags.includes('possible_duplicate'));
    assert.ok(!body.rows.find((r) => r.description === 'PAYROLL').flags.includes('possible_duplicate'));

    const [lookup] = queries;
    assert.deepEqual(lookup.params, [7, ['2026-09-14']]);
  });

  test('empty OCR output is a warning', async () => {
    const body = await (await post('/import/parse', screenshot({ lines: [] }))).json();
    assert.deepEqual(body.rows, []);
    assert.deepEqual(body.warnings, ['no_text_found']);
    assert.equal(queries.length, 0);
  });

  test('unparseable text comes back for manual entry, with the fallback marked unavailable', async () => {
    const body = await (await post('/import/parse', screenshot({
      lines: [ocrLine('hello', 0, 0), ocrLine('world', 0, 60)],
    }))).json();
    assert.deepEqual(body.rows, []);
    assert.deepEqual(body.unparsedLines, ['hello', 'world']);
    assert.ok(body.warnings.includes('ai_fallback_unavailable'));
  });

  describe('rejects a malformed payload before parsing', () => {
    for (const [label, overrides] of [
      ['no today', { today: undefined }],
      ['an impossible today', { today: '2026-02-30' }],
      ['a timestamp for today', { today: '2026-09-16T00:00:00Z' }],
      ['no image size', { image: undefined }],
      ['a zero-width image', { image: { width: 0, height: 10 } }],
      ['lines that are not an array', { lines: 'Sep 14' }],
      ['too many lines', { lines: Array.from({ length: 2001 }, () => ocrLine('x', 0, 0)) }],
      ['a line that is too long', { lines: [ocrLine('x'.repeat(501), 0, 0)] }],
      ['a confidence above 1', { lines: [ocrLine('x', 0, 0, 1.5)] }],
      ['a box with no height', { lines: [{ text: 'x', conf: 0.9, box: { x: 0, y: 0, width: 1 } }] }],
      ['a number for text', { lines: [{ text: 42, conf: 0.9, box: { x: 0, y: 0, width: 1, height: 1 } }] }],
    ]) {
      test(label, async () => {
        const res = await post('/import/parse', screenshot(overrides));
        assert.equal(res.status, 400);
        assert.equal(queries.length, 0);
      });
    }
  });

  test('accepts a body above the app-wide 100 kB limit', async () => {
    const lines = Array.from({ length: 1500 }, (_, i) => ocrLine(`LINE ${i} ${'x'.repeat(80)}`, 0, i * 60));
    const res = await post('/import/parse', screenshot({ lines }));
    assert.equal(res.status, 200);
  });

  test('never logs the screenshot text, even when it fails', async () => {
    mock.method(db, 'query', async () => {
      const error = new Error('invalid input syntax for type date: "SECRETMERCHANT"');
      error.code = '22007';
      throw error;
    });
    const res = await post('/import/parse', screenshot());
    assert.equal(res.status, 500);
    const log = output();
    assert.match(log, /Import parse error/);
    assert.doesNotMatch(log, /SECRETMERCHANT|23\.47|1,?250/);
  });
});

describe('POST /transactions/import', () => {
  const row = (overrides = {}) => ({
    date: '2026-09-14',
    amount: '23.47',
    description: 'SECRETMERCHANT',
    category: 'Groceries',
    type: 'expense',
    currency: 'CAD',
    source: 'ocr',
    edited: false,
    ...overrides,
  });

  test('saves every row and the batch counts in one statement', async () => {
    const res = await post('/transactions/import', {
      rows: [row(), row({ amount: '5.00', edited: true }), row({ source: 'ocr_llm' })],
    });
    assert.equal(res.status, 201);
    assert.deepEqual((await res.json()).ids, [100, 101, 102]);

    assert.equal(queries.length, 1, 'rows and batch must be one statement');
    const [{ text, params }] = queries;
    assert.match(text, /INSERT INTO transactions/);
    assert.match(text, /INSERT INTO import_batches/);
    assert.equal(params.length, 3 * 8 + 4);
    assert.deepEqual(params.slice(0, 8), [7, '23.47', 'SECRETMERCHANT', 'Groceries', 'expense', '2026-09-14', 'CAD', 'ocr']);
    assert.deepEqual(params.slice(-4), [7, 3, 1, 1]);
  });

  test('trims descriptions before saving', async () => {
    await post('/transactions/import', { rows: [row({ description: '  Sobeys  ' })] });
    assert.equal(queries[0].params[2], 'Sobeys');
  });

  test('one bad row rejects the whole import and names it', async () => {
    const res = await post('/transactions/import', {
      rows: [row(), row({ amount: '-1.00' }), row(), row({ date: '2026-02-30', type: 'sideways' })],
    });
    assert.equal(res.status, 400);
    assert.deepEqual((await res.json()).invalidRows, [1, 3]);
    assert.equal(queries.length, 0);
  });

  describe('rejects', () => {
    for (const [label, body] of [
      ['no rows', { rows: [] }],
      ['rows that are not an array', { rows: 'x' }],
      ['more than 100 rows', { rows: Array.from({ length: 101 }, () => row()) }],
      ['a numeric amount', { rows: [row({ amount: 23.47 })] }],
      ['an amount without cents', { rows: [row({ amount: '23' })] }],
      ['a zero amount', { rows: [row({ amount: '0.00' })] }],
      ['an amount too large for the column', { rows: [row({ amount: '123456789.00' })] }],
      ['a blank description', { rows: [row({ description: '   ' })] }],
      ['a missing category', { rows: [row({ category: '' })] }],
      ['a timestamp for a date', { rows: [row({ date: '2026-09-14T00:00:00Z' })] }],
      ['an unknown currency', { rows: [row({ currency: 'XYZ' })] }],
      ['a manual source', { rows: [row({ source: 'manual' })] }],
      ['a string for edited', { rows: [row({ edited: 'false' })] }],
    ]) {
      test(label, async () => {
        const res = await post('/transactions/import', body);
        assert.equal(res.status, 400);
        assert.equal(queries.length, 0);
      });
    }
  });

  test('never logs the rows, even when the insert fails', async () => {
    mock.method(db, 'query', async () => {
      const error = new Error('value "SECRETMERCHANT" violates something');
      error.code = '23514';
      throw error;
    });
    const res = await post('/transactions/import', { rows: [row()] });
    assert.equal(res.status, 500);
    const log = output();
    assert.match(log, /Import transactions error/);
    assert.doesNotMatch(log, /SECRETMERCHANT|23\.47/);
  });
});
