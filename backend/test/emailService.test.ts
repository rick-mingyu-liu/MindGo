import { test, describe, before, after, beforeEach, afterEach, mock } from 'node:test';
import assert from 'node:assert/strict';
import db = require('../db/connection');
import exchangeRateService = require('../services/exchangeRateService');
import config = require('../config');
import { generateWeeklyReport, verificationEmail, weeklyReportSubject } from '../services/emailService';
import { escapeHtml } from '../services/emailLayout';

/**
 * The verification email and the Sunday report, rendered without a database
 * or a network: db.query is answered by SQL shape and the exchange rate is
 * stubbed.
 *
 * Two things here are guards rather than checks of wording. Registration lets
 * anyone pick a first name and send the verification email to any address, so
 * a name rendered as raw HTML put an attacker's link inside an email signed by
 * TermPocket; every user-typed value must come out escaped. And a weekly total
 * that summed CNY and CAD as one unit is a plausible wrong number, so mixed
 * currencies are asserted converted.
 */

const FRONTEND = 'https://app.example.test';
// Thursday Oct 15 2026 in Toronto: the week is Oct 9 – 15, the term Fall 2026.
const NOW = new Date('2026-10-15T16:00:00Z');
const WEEK_START = '2026-10-09';
const TERM_START = '2026-09-01';

interface Fixture {
  firstName?: string;
  week: Array<{ currency: string; type: 'income' | 'expense'; category: string; total: string }>;
  term?: Array<{ currency: string; type: 'income' | 'expense'; category: string; total: string }>;
  recent?: Array<Record<string, string>>;
  goals?: Array<Record<string, string | null>>;
}

const queries: Array<{ text: string; params: unknown[] }> = [];

function answer(f: Fixture): void {
  mock.method(db, 'query', async (text: string, params: unknown[] = []) => {
    queries.push({ text, params });
    const rows = (r: unknown[]) => ({ rows: r, rowCount: r.length });
    if (/FROM users/.test(text)) return rows(f.firstName === undefined ? [] : [{ first_name: f.firstName }]);
    if (/GROUP BY currency, type, category/.test(text)) {
      const groups = params[1] === WEEK_START ? f.week : params[1] === TERM_START ? (f.term ?? f.week) : null;
      assert.ok(groups, `unexpected window starting ${String(params[1])}`);
      return rows(groups.map((g) => ({ ...g, count: '1' })));
    }
    if (/FROM transactions/.test(text)) return rows(f.recent ?? []);
    if (/FROM savings_goals/.test(text)) return rows(f.goals ?? []);
    throw new Error(`unexpected query: ${text}`);
  });
}

const RATES: Record<string, number> = { USD: 1.4, CNY: 0.2 };

let savedUrl: string;
before(() => { savedUrl = config.frontendUrl; config.frontendUrl = FRONTEND; });
after(() => { config.frontendUrl = savedUrl; });
beforeEach(() => {
  queries.length = 0;
  mock.method(exchangeRateService, 'getExchangeRate', async (from: string, to: string) => {
    assert.equal(to, 'CAD');
    const rate = RATES[from];
    if (rate === undefined) throw new Error('no rate');
    return rate;
  });
});
afterEach(() => mock.restoreAll());

const hrefs = (html: string): string[] => [...html.matchAll(/(?:href|src)="([^"]*)"/g)].map((m) => m[1] ?? '');

function assertLinksFromConfig(html: string): void {
  const links = hrefs(html);
  assert.ok(links.length > 0);
  for (const link of links) {
    assert.ok(link.startsWith(FRONTEND) || link === 'mailto:support@termpocket.com', `link not built from config.frontendUrl: ${link}`);
  }
  assert.ok(links.includes(`${FRONTEND}/settings`));
  assert.ok(links.includes(`${FRONTEND}/privacy`));
  assert.ok(links.includes(`${FRONTEND}/icon-192.png`));
}

const HOSTILE_NAME = '<a href="https://evil.example/login">Reset your password</a>';
const HOSTILE_DESC = '<script>alert(1)</script>';
const HOSTILE_CATEGORY = '<img src=x onerror=alert(1)>';

const FULL: Fixture = {
  firstName: 'Alex',
  week: [
    { currency: 'CAD', type: 'expense', category: 'Food & Dining', total: '100.00' },
    { currency: 'USD', type: 'expense', category: 'Shopping', total: '50.00' },
    { currency: 'CNY', type: 'income', category: 'Salary', total: '500.00' },
  ],
  term: [
    { currency: 'CAD', type: 'income', category: 'Salary', total: '3000.00' },
    { currency: 'CNY', type: 'expense', category: 'Food & Dining', total: '1000.00' },
  ],
  recent: [
    { date: '2026-10-14', type: 'expense', description: 'Grocery run', category: 'Food & Dining', amount: '100.00', currency: 'CAD' },
    { date: '2026-10-12', type: 'income', description: 'Freelance', category: 'Salary', amount: '500.00', currency: 'CNY' },
  ],
  goals: [
    { name: 'Laptop', current_amount: '300.00', target_amount: '1200.00', target_date: '2026-12-31', currency: 'CAD' },
  ],
};

describe('generateWeeklyReport', () => {
  test('converts each currency to CAD before adding (USD 1.4, CNY 0.2)', async () => {
    answer(FULL);
    const { text, html } = await generateWeeklyReport(1, NOW);
    // Week: 100 CAD + 50 USD (70) spent, 500 CNY (100) earned.
    assert.match(text, /THIS WEEK\nIncome\s+\$100\.00\nSpending\s+\$170\.00\nNet\s+-\$70\.00/);
    // Term: 3000 CAD earned, 1000 CNY (200) spent.
    assert.match(text, /FALL 2026 SO FAR\nIncome\s+\$3,000\.00\nSpending\s+\$200\.00\nNet\s+\$2,800\.00/);
    assert.match(text, /All amounts in CAD/);
    assert.match(html, /\$170\.00/);
    assert.match(html, /Fall 2026 so far/);
    // Recent rows stay in the currency they were recorded in.
    assert.match(text, /\+CN¥500\.00\s+Freelance/);
  });

  test('top categories show their share of the week\'s spending', async () => {
    answer(FULL);
    const { text } = await generateWeeklyReport(1, NOW);
    assert.match(text, /Food & Dining\s+\$100\.00 \(59%\)/);
    assert.match(text, /Shopping\s+\$70\.00 \(41%\)/);
  });

  test('queries the Toronto week and the term so far, half-open, nothing after today', async () => {
    answer(FULL);
    await generateWeeklyReport(1, NOW);
    const windows = queries.filter((q) => /GROUP BY/.test(q.text)).map((q) => q.params);
    assert.deepEqual(windows, [[1, WEEK_START, '2026-10-16'], [1, TERM_START, '2026-10-16']]);
  });

  test('escapes the first name, descriptions, categories and goal names', async () => {
    answer({
      ...FULL,
      firstName: HOSTILE_NAME,
      week: [{ currency: 'CAD', type: 'expense', category: HOSTILE_CATEGORY, total: '10.00' }],
      recent: [{ date: '2026-10-14', type: 'expense', description: HOSTILE_DESC, category: HOSTILE_CATEGORY, amount: '10.00', currency: 'CAD' }],
      goals: [{ name: '<b onclick="x()">Trip</b>', current_amount: '1', target_amount: '2', target_date: null, currency: 'CAD' }],
    });
    const { html } = await generateWeeklyReport(1, NOW);
    assert.ok(!html.includes('<script'), 'script tag survived');
    assert.ok(!html.includes('evil.example/login">'), 'attacker link survived as markup');
    assert.ok(!html.includes('<img src=x'), 'img tag survived');
    assert.ok(!html.includes('<b onclick'), 'goal markup survived');
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(html.includes('&lt;a href=&quot;https://evil.example/login&quot;&gt;'));
    assertLinksFromConfig(html);
  });

  test('links come from config.frontendUrl and nothing says mindgo', async () => {
    answer(FULL);
    const { text, html } = await generateWeeklyReport(1, NOW);
    assertLinksFromConfig(html);
    assert.ok(hrefs(html).includes(FRONTEND), 'no "Open your dashboard" link');
    assert.match(text, new RegExp(`Open your dashboard: ${FRONTEND}`));
    assert.match(text, /Turn them off in Settings/);
    assert.doesNotMatch(text + html, /mindgo/i);
    assert.doesNotMatch(text, /={5}|─{5}/);
  });

  test('a goal with a zero target has no percentage, bar or NaN', async () => {
    answer({ ...FULL, goals: [{ name: 'Someday', current_amount: '50.00', target_amount: '0.00', target_date: null, currency: 'CAD' }] });
    const { text, html } = await generateWeeklyReport(1, NOW);
    assert.match(text, /Someday: \$50\.00 of \$0\.00 - No target amount set/);
    assert.doesNotMatch(text + html, /NaN|Infinity/);
  });

  test('goal statuses: overdue, reached and undated', async () => {
    answer({
      ...FULL,
      goals: [
        { name: 'Old', current_amount: '10', target_amount: '100', target_date: '2026-09-01', currency: 'CAD' },
        { name: 'Done', current_amount: '120', target_amount: '100', target_date: '2026-12-01', currency: 'USD' },
        { name: 'Open', current_amount: '10', target_amount: '100', target_date: null, currency: 'CAD' },
      ],
    });
    const { text } = await generateWeeklyReport(1, NOW);
    assert.match(text, /Old: \$10\.00 of \$100\.00 \(10%\) - Overdue since Sep 1, 2026/);
    assert.match(text, /Done: US\$120\.00 of US\$100\.00 \(100%\) - Reached/);
    assert.match(text, /Open: \$10\.00 of \$100\.00 \(10%\) - No target date/);
  });

  test('no goals means no goals section', async () => {
    answer({ ...FULL, goals: [] });
    const { text, html } = await generateWeeklyReport(1, NOW);
    assert.doesNotMatch(text + html, /Savings goals|SAVINGS GOALS/);
  });

  test('a missing exchange rate fails the report instead of mailing a wrong total', async () => {
    answer({ ...FULL, week: [{ currency: 'EUR', type: 'expense', category: 'Travel', total: '10.00' }] });
    await assert.rejects(generateWeeklyReport(1, NOW), { name: 'RateUnavailableError' });
  });
});

describe('generateWeeklyReport, with no transactions this week', () => {
  test('returns { text, html } with a short note and an add-a-transaction link', async () => {
    answer({ week: [] });
    const report = await generateWeeklyReport(1, NOW);
    assert.equal(typeof report, 'object', 'returned a bare string instead of { text, html }');
    assert.match(report.text, /^Hi there,/);
    assert.match(report.text, /Nothing recorded for Oct 9 – 15\./);
    assert.match(report.text, new RegExp(`Add a transaction: ${FRONTEND}/transactions/new`));
    assert.ok(hrefs(report.html).includes(`${FRONTEND}/transactions/new`));
    assertLinksFromConfig(report.html);
    assert.doesNotMatch(report.text + report.html, /mindgo/i);
    // Nothing beyond the name and the empty week was read.
    assert.equal(queries.length, 2);
  });
});

describe('weeklyReportSubject', () => {
  test('names the week ending today in Toronto', () => {
    assert.equal(weeklyReportSubject(NOW), 'Your TermPocket week: Oct 9 – 15');
    // Sunday 10 p.m. in Toronto is already Monday in UTC.
    assert.equal(weeklyReportSubject(new Date('2026-10-19T02:00:00Z')), 'Your TermPocket week: Oct 12 – 18');
    assert.equal(weeklyReportSubject(new Date('2026-10-04T16:00:00Z')), 'Your TermPocket week: Sep 28 – Oct 4');
  });
});

describe('verificationEmail', () => {
  test('escapes a hostile first name and keeps the link, expiry and ignore line', () => {
    const { subject, text, html } = verificationEmail(HOSTILE_NAME, 'abc123');
    assert.equal(subject, 'Verify your TermPocket account');
    assert.ok(!html.includes('evil.example/login">'), 'attacker link survived as markup');
    assert.ok(html.includes(escapeHtml(HOSTILE_NAME)));
    const url = `${FRONTEND}/verify-email?token=abc123`;
    assert.ok(hrefs(html).filter((h) => h === url).length === 2, 'button and copy-paste link');
    assert.match(text, new RegExp(url.replace(/[.?]/g, '\\$&')));
    const minutes = Math.round(config.emailVerification.tokenExpiry / 60000);
    assert.match(text, new RegExp(`expires in ${minutes} minutes`));
    assert.match(html, /safely ignore this email/);
    assertLinksFromConfig(html);
    assert.doesNotMatch(text + html, /mindgo|All rights reserved/i);
  });
});

describe('escapeHtml', () => {
  test('escapes the five characters that matter in content and attributes', () => {
    assert.equal(escapeHtml(`<a href="x" title='y'>&</a>`), '&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;');
    assert.equal(escapeHtml(null), '');
  });
});
