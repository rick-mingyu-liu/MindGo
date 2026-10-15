import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
const enabled = !!process.env.TEST_DATABASE_URL;
if (enabled) { process.env.DATABASE_URL = process.env.TEST_DATABASE_URL; process.env.NODE_ENV = 'test'; }

/** The record tools against real PostgreSQL: one user's reads never see another's rows, and pages never repeat or skip. */
describe('agent investigation against the database', { skip: !enabled }, () => {
  let investigation: typeof import('../services/agent/investigation');
  let db: typeof import('../db/connection');
  const users: number[] = [];
  let alice: number; let bob: number;
  const window = { start: '2026-09-01', end_exclusive: '2026-10-15' };

  before(async () => {
    investigation = require('../services/agent/investigation'); db = require('../db/connection');
    for (let n = 0; n < 2; n++) users.push((await db.query<{ id: number }>("INSERT INTO users(email,password_hash,first_name,last_name) VALUES($1,'x','Investigation','Test') RETURNING id", [`investigation-${randomUUID()}@example.invalid`])).rows[0]!.id);
    alice = users[0]!; bob = users[1]!;
    // Alice: 25 CAD rows, several sharing a day so the keyset must order by id too.
    for (let i = 0; i < 25; i++) {
      await db.query("INSERT INTO transactions(user_id,amount,description,category,type,date,currency) VALUES($1,$2,$3,'Groceries','expense',$4,'CAD')",
        [alice, '1.10', `Fictional groceries ${i}`, `2026-09-${String(1 + Math.floor(i / 3)).padStart(2, '0')}`]);
    }
    await db.query("INSERT INTO transactions(user_id,amount,description,category,type,date,currency) VALUES($1,'500.00','Fictional pay','Salary','income','2026-09-15','CAD')", [alice]);
    // Bob: same window and categories, different amounts and a distinctive description.
    for (let i = 0; i < 5; i++) {
      await db.query("INSERT INTO transactions(user_id,amount,description,category,type,date,currency) VALUES($1,'999.99','Bob only','Groceries','expense','2026-09-02','CAD')", [bob]);
    }
  });
  after(async () => { if (db) { await db.query('DELETE FROM users WHERE id=ANY($1::int[])', [users]); await db.getPool().end(); } });

  test("another user's rows never appear in a summary, comparison or page", async () => {
    const records = investigation.recordsFor(alice);
    const summary = await records.spendingSummary({ ...window, currency: 'CAD' }) as Awaited<ReturnType<typeof investigation.spendingSummary>>;
    assert.equal(summary.expenses, 27.5);
    assert.equal(summary.income, 500);
    assert.equal(summary.transaction_count, 26);
    const compared = await investigation.compareSpending(alice, { a: { start: '2026-05-01', end_exclusive: '2026-06-14' }, b: window, currency: 'CAD' });
    assert.equal(compared.b.expenses, 27.5);
    assert.equal(compared.a.transaction_count, 0);
    const page = await investigation.transactionDetails(alice, { ...window, limit: 25 });
    assert.equal(page.rows.length, 25);
    assert.equal(page.truncated, true);
    assert.ok(page.rows.every(r => r.description_untrusted !== 'Bob only' && r.amount !== '999.99'));
    const bobSummary = await investigation.spendingSummary(bob, { ...window, currency: 'CAD' });
    assert.equal(bobSummary.expenses, 4999.95);
  });

  test('paging with the cursor returns each row exactly once, newest first', async () => {
    const seen: number[] = [];
    let cursor: string | undefined;
    let pages = 0;
    do {
      const page = await investigation.transactionDetails(alice, { ...window, type: 'expense', limit: 7, ...(cursor ? { cursor } : {}) });
      seen.push(...page.rows.map(r => r.id));
      for (let i = 1; i < page.rows.length; i++) {
        const [prev, cur] = [page.rows[i - 1]!, page.rows[i]!];
        assert.ok(prev.date > cur.date || (prev.date === cur.date && prev.id > cur.id));
      }
      assert.ok(page.rows.every(r => r.amount === '1.10' && r.currency === 'CAD' && /^\d{4}-\d{2}-\d{2}$/.test(r.date)));
      cursor = page.next_cursor ?? undefined;
      pages++;
    } while (cursor && pages < 10);
    assert.equal(pages, 4);
    assert.equal(seen.length, 25);
    assert.equal(new Set(seen).size, 25);
  });
});
