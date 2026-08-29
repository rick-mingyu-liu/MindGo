const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { buildDemoData, CATEGORIES, isCoopTerm, TERMS_OF_HISTORY } = require('../db/demoData');
const { currentTerm, previousTerm, boundsOf, termOf } = require('../utils/terms');
const { monthOf } = require('../utils/dates');

/**
 * The demo account is generated relative to today rather than hardcoded, so
 * these tests are mostly about that: whatever day it is run, the demo has to
 * open on a populated current term with no overdue goals.
 *
 * The old seed failed both. Its newest transaction was 2025-06-30, so by
 * August 2026 the dashboard's default window (`?term=current`) was empty, and
 * all three of its savings goals had target dates in the past.
 */

// A spread of "todays": each term of the year, a leap day, a month end, and
// the first day of a term (when the current term has almost nothing in it).
const DAYS = [
  '2026-08-29', '2026-01-01', '2026-05-01', '2026-09-01', '2026-12-31',
  '2028-02-29', '2027-03-31', '2030-07-15', '2026-04-30',
];

const at = (day) => buildDemoData(new Date(`${day}T12:00:00`));

describe('the demo account is evergreen', () => {
  for (const day of DAYS) {
    test(`has transactions in the current term on ${day}`, () => {
      const now = new Date(`${day}T12:00:00`);
      const data = buildDemoData(now);
      const term = currentTerm(now);
      const inTerm = data.transactions.filter((t) => termOf(t.date) === term);
      assert.ok(inTerm.length > 0, `the default window would be empty on ${day}`);
    });

    test(`the previous term is complete on ${day}`, () => {
      // "Last term" is the comparison the period selector exists for; a
      // half-empty one makes the contrast meaningless.
      const now = new Date(`${day}T12:00:00`);
      const previous = previousTerm(currentTerm(now));
      const months = new Set(
        buildDemoData(now).transactions
          .filter((t) => termOf(t.date) === previous)
          .map((t) => monthOf(t.date))
      );
      assert.equal(months.size, 4, `${previous} had ${months.size} months on ${day}`);
    });

    test(`no goal is overdue on ${day}`, () => {
      for (const goal of at(day).goals) {
        assert.ok(goal.target_date > day, `${goal.name} targets ${goal.target_date}, in the past`);
      }
    });
  }

  test('never dates a transaction in the future', () => {
    // A demo showing next month's rent already paid reads as fake, and future
    // rows would land in every total.
    for (const day of DAYS) {
      for (const t of at(day).transactions) {
        assert.ok(t.date <= day, `${t.description} dated ${t.date}, after ${day}`);
      }
    }
  });

  test('covers enough history for the yearly view', () => {
    const data = at('2026-08-29');
    assert.equal(data.terms.length, TERMS_OF_HISTORY);
    const years = new Set(data.transactions.map((t) => t.date.slice(0, 4)));
    assert.ok(years.size >= 2, `only ${[...years]} — "Last year" would be empty`);
  });
});

describe('the demo data is deterministic', () => {
  test('the same day produces byte-identical data', () => {
    // What makes re-seeding safe to run on a schedule: a refresh does not
    // quietly reshuffle the numbers a visitor saw a minute ago.
    assert.deepEqual(at('2026-08-29'), at('2026-08-29'));
  });

  test('amounts still vary, so the chart is not a flat line', () => {
    const groceries = at('2026-08-29').transactions
      .filter((t) => t.category === 'Groceries')
      .map((t) => t.amount);
    assert.ok(new Set(groceries).size > 5, 'grocery amounts barely varied');
  });
});

describe('the story the demo tells', () => {
  const data = at('2026-08-29');
  const net = (termId) => data.transactions
    .filter((t) => termOf(t.date) === termId)
    .reduce((sum, t) => sum + (t.type === 'income' ? t.amount : -t.amount), 0);

  test('a co-op term earns and a study term does not', () => {
    // The contrast is the reason the period selector is interesting. If both
    // term shapes looked alike, "This term vs Last term" would show nothing.
    const complete = data.terms.slice(0, -1); // the current term is partial
    for (const [i, termId] of data.terms.entries()) {
      if (!complete.includes(termId)) continue;
      const offset = data.terms.length - 1 - i;
      if (isCoopTerm(offset)) {
        assert.ok(net(termId) > 0, `co-op term ${termId} did not come out ahead: ${net(termId)}`);
      } else {
        assert.ok(net(termId) < 0, `study term ${termId} did not run at a loss: ${net(termId)}`);
      }
    }
  });

  test('a study term is dominated by tuition and rent', () => {
    const study = data.terms.find((id, i) => !isCoopTerm(data.terms.length - 1 - i));
    const byCategory = {};
    for (const t of data.transactions.filter((t) => termOf(t.date) === study && t.type === 'expense')) {
      byCategory[t.category] = (byCategory[t.category] || 0) + t.amount;
    }
    const top = Object.entries(byCategory).sort((a, b) => b[1] - a[1]).map(([c]) => c);
    assert.deepEqual(top.slice(0, 2).sort(), ['Education', 'Housing']);
  });

  test('the current term is truncated at today, so it reads as live', () => {
    const now = new Date('2026-08-29T12:00:00');
    const { end } = boundsOf(currentTerm(now));
    const latest = at('2026-08-29').transactions.at(-1).date;
    assert.ok(latest < end, 'the current term looks finished');
    assert.ok(latest >= '2026-08-01', `the newest transaction is stale: ${latest}`);
  });
});

describe('categories stay in step with the frontend', () => {
  /**
   * The canonical category list lives in
   * `frontend/pages/transactions/new.tsx`, and the seed has always kept its
   * own copy with nothing checking the two agree. A demo transaction in an
   * unlisted category renders with a hash-derived colour and an untranslated
   * name — visible, but only to someone who happens to look.
   */
  const FRONTEND = path.join(__dirname, '..', '..', 'frontend', 'pages', 'transactions', 'new.tsx');

  function frontendCategories() {
    const source = fs.readFileSync(FRONTEND, 'utf8');
    const block = /export const categories\s*=\s*\{([\s\S]*?)\n\}/.exec(source);
    assert.ok(block, 'could not find the exported categories object — has it moved?');
    const listOf = (key) => {
      const list = new RegExp(`${key}:\\s*\\[([\\s\\S]*?)\\]`).exec(block[1]);
      assert.ok(list, `no ${key} list in the categories object`);
      return [...list[1].matchAll(/'([^']+)'/g)].map((m) => m[1]);
    };
    return { income: listOf('income'), expense: listOf('expense') };
  }

  test('the backend copy matches the frontend list exactly', () => {
    assert.deepEqual(CATEGORIES, frontendCategories());
  });

  test('every seeded transaction uses a category the picker offers', () => {
    const known = { income: new Set(CATEGORIES.income), expense: new Set(CATEGORIES.expense) };
    for (const t of at('2026-08-29').transactions) {
      assert.ok(known[t.type].has(t.category),
        `'${t.category}' is not a known ${t.type} category`);
    }
  });

  test('the demo exercises most of the picker, so the charts look real', () => {
    const used = new Set(at('2026-08-29').transactions.map((t) => t.category));
    const all = [...CATEGORIES.income, ...CATEGORIES.expense];
    const covered = all.filter((c) => used.has(c)).length;
    assert.ok(covered >= 12, `only ${covered} of ${all.length} categories appear`);
  });
});
