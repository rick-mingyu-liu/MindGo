/**
 * Integration test over the path that matters: log in, create transactions,
 * read the summary back, and confirm one user cannot touch another's rows.
 *
 * It exercises auth, request validation, ownership scoping and the summary
 * arithmetic in one pass — the same ground that was covered by hand-written
 * curl commands, twice, during the region migration.
 *
 * ── Running it ───────────────────────────────────────────────────────────────
 * Needs a database, and deliberately will not borrow the one in .env:
 *
 *     TEST_DATABASE_URL=postgres://... npm test
 *
 * Without that variable the suite skips rather than failing, so `npm test`
 * stays useful on a machine with no Postgres. Requiring a separate variable is
 * the guard: pointing these tests at production has to be a deliberate act, and
 * they create and delete users.
 *
 * The database must already have the schema (`npm run db:setup`).
 *
 * No network: every transaction here is in one currency, so the summary does no
 * conversion and never calls the exchange-rate API. Conversion itself is
 * covered by exchangeRateService.test.js.
 */
const { test, describe, before, after } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');

const HAVE_DB = Boolean(process.env.TEST_DATABASE_URL);

if (HAVE_DB) {
  // Must be set before app.js -> config -> db/connection is required.
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  process.env.JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
  process.env.NODE_ENV = 'test';
  // authLimiter counts /register, /login, /resend-verification and /test-email
  // together against one IP, and the whole suite shares an IP. At the default
  // of 5 the tests start 429ing partway through. Raised here rather than
  // branched on NODE_ENV in the middleware.
  process.env.RATE_LIMIT_AUTH_MAX = '10000';
  process.env.RATE_LIMIT_API_MAX = '10000';
}

describe('API integration', { skip: HAVE_DB ? false : 'set TEST_DATABASE_URL to run' }, () => {
  let request, db, bcrypt, app;
  const PASSWORD = 'test-password-123';
  const users = [];
  let alice, bob, aliceToken, bobToken;

  /** Creates a verified user directly, bypassing registration's email round-trip. */
  async function seedUser() {
    const email = `it-${crypto.randomUUID()}@example.invalid`;
    const hash = await bcrypt.hash(PASSWORD, 10);
    const r = await db.query(
      `INSERT INTO users (email, password_hash, first_name, last_name, email_verified)
       VALUES ($1, $2, 'Integration', 'Test', TRUE) RETURNING id, email`,
      [email, hash]
    );
    users.push(r.rows[0].id);
    return r.rows[0];
  }

  async function login(email, password = PASSWORD) {
    return request(app).post('/auth/login').send({ email, password });
  }

  before(async () => {
    request = require('supertest');
    app = require('../app');
    db = require('../db/connection');
    bcrypt = require('bcryptjs');

    alice = await seedUser();
    bob = await seedUser();

    // authLimiter allows 5 attempts per 15 minutes per IP, and the whole suite
    // shares one. Log in once per user here and reuse the tokens; a test that
    // logs in on demand trips the limiter and fails with a 429.
    for (const [user, assign] of [[alice, (t) => (aliceToken = t)], [bob, (t) => (bobToken = t)]]) {
      const res = await login(user.email);
      assert.equal(res.status, 200, `login failed: ${JSON.stringify(res.body)}`);
      assign(res.body.token);
    }
  });

  after(async () => {
    // ON DELETE CASCADE clears the transactions with them.
    if (users.length) {
      await db.query('DELETE FROM users WHERE id = ANY($1)', [users]);
    }
    const pool = db.getPool();
    if (pool) await pool.end();
  });

  const auth = (req) => req.set('Authorization', `Bearer ${aliceToken}`);

  describe('authentication', () => {
    test('rejects a wrong password without saying which field was wrong', async () => {
      const res = await login(alice.email, 'not-the-password');
      assert.equal(res.status, 400);
      assert.match(res.body.error, /Invalid credentials/);
    });

    test('rejects an unauthenticated read', async () => {
      const res = await request(app).get('/transactions');
      assert.equal(res.status, 401);
    });

    test('rejects a forged token', async () => {
      const res = await request(app)
        .get('/transactions')
        .set('Authorization', 'Bearer not.a.real.token');
      assert.equal(res.status, 401);
    });

    test('leaves /health open, so platform health checks are never blocked', async () => {
      const res = await request(app).get('/health');
      assert.equal(res.status, 200);
      assert.equal(res.body.status, 'OK');
    });
  });

  describe('registration validation', () => {
    // These assert the 400 path only. Registration proper calls MailboxLayer,
    // which needs a key and a network, so the happy path is out of scope here.
    const valid = {
      email: 'someone@example.invalid',
      password: 'long-enough-password',
      first_name: 'A',
      last_name: 'B',
    };
    const post = (body) => request(app).post('/auth/register').send({ ...valid, ...body });
    const messages = (res) => res.body.errors.map((e) => e.msg).join(' ');

    test('rejects a password shorter than the configured minimum', async () => {
      const res = await post({ password: 'short' });
      assert.equal(res.status, 400);
      assert.match(messages(res), /at least 8 characters/);
    });

    test('rejects a name longer than the column allows', async () => {
      const res = await post({ first_name: 'x'.repeat(101) });
      assert.equal(res.status, 400);
      assert.match(messages(res), /at most 100 characters/);
    });

    test('rejects a malformed email', async () => {
      const res = await post({ email: 'not-an-email' });
      assert.equal(res.status, 400);
    });
  });

  describe('transactions', () => {
    const MONTH = { year: 2020, month: 6 }; // fixed, so the summary query is deterministic
    const made = [];

    const create = (body) =>
      auth(request(app).post('/transactions')).send({
        date: '2020-06-15',
        currency: 'CAD',
        ...body,
      });

    test('rejects an invalid payload', async () => {
      const res = await create({ amount: -5, description: '', category: '', type: 'sideways' });
      assert.equal(res.status, 400);
      assert.ok(res.body.errors.length >= 3, 'each bad field should be reported');
    });

    test('rejects a currency outside the allowed set', async () => {
      const res = await create({
        amount: 10, description: 'x', category: 'Food', type: 'expense', currency: 'XYZ',
      });
      assert.equal(res.status, 400);
    });

    test('creates income and expenses', async () => {
      const rows = [
        { amount: 5000, description: 'Salary', category: 'Salary', type: 'income' },
        { amount: 200.5, description: 'Groceries', category: 'Food', type: 'expense' },
        { amount: 99.5, description: 'Bus pass', category: 'Transport', type: 'expense' },
      ];
      for (const row of rows) {
        const res = await create(row);
        assert.equal(res.status, 201, JSON.stringify(res.body));
        made.push(res.body.transaction ? res.body.transaction.id : res.body.id);
      }
      assert.equal(made.filter(Boolean).length, 3, 'every create should return an id');
    });

    test('summary totals match what was created', async () => {
      const res = await auth(
        request(app).get(`/summary/monthly?year=${MONTH.year}&month=${MONTH.month}&targetCurrency=CAD`)
      );
      assert.equal(res.status, 200);

      const s = res.body.summary || res.body;
      assert.equal(Number(s.totalIncome), 5000);
      assert.equal(Number(s.totalExpenses), 300);
      // The interesting one: net is the subtraction, and a sign error here
      // still looks like a number.
      assert.equal(Number(s.netIncome), 4700);
    });

    test('summary keeps categories separate', async () => {
      const res = await auth(
        request(app).get(`/summary/monthly?year=${MONTH.year}&month=${MONTH.month}&targetCurrency=CAD`)
      );
      const categories = (res.body.summary || res.body).categories || {};
      assert.equal(Number(categories.Food.expenses), 200.5);
      assert.equal(Number(categories.Transport.expenses), 99.5);
    });

    test('a different month is empty, so the date filter is real', async () => {
      const res = await auth(
        request(app).get(`/summary/monthly?year=${MONTH.year}&month=7&targetCurrency=CAD`)
      );
      assert.equal(res.status, 200);
      assert.equal(Number((res.body.summary || res.body).totalIncome), 0);
    });

    test('one user cannot read another user\'s transactions', async () => {
      const bobsView = await request(app)
        .get('/transactions')
        .set('Authorization', `Bearer ${bobToken}`);
      assert.equal(bobsView.status, 200);

      const rows = bobsView.body.transactions || bobsView.body;
      const ids = (Array.isArray(rows) ? rows : []).map((t) => t.id);
      for (const id of made) {
        assert.ok(!ids.includes(id), `Bob can see Alice's transaction ${id}`);
      }
    });

    test('deleting removes the row and the summary follows', async () => {
      const res = await auth(request(app).delete(`/transactions/${made[0]}`));
      assert.equal(res.status, 200);

      const after = await auth(
        request(app).get(`/summary/monthly?year=${MONTH.year}&month=${MONTH.month}&targetCurrency=CAD`)
      );
      assert.equal(Number((after.body.summary || after.body).totalIncome), 0);
    });

    test('deleting a row that is not yours does not delete it', async () => {
      const attempt = await request(app)
        .delete(`/transactions/${made[1]}`)
        .set('Authorization', `Bearer ${bobToken}`);
      assert.notEqual(attempt.status, 200);

      // And it is still Alice's. There is no GET /transactions/:id, so this
      // checks the list.
      const mine = await auth(request(app).get('/transactions'));
      const rows = mine.body.transactions || mine.body;
      assert.ok(
        rows.some((t) => t.id === made[1]),
        "Bob's delete removed Alice's row"
      );
    });
  });
});
