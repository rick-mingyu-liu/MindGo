import { query } from '../db/connection';
import { getExchangeRate } from './exchangeRateService';
import { boundsOf, labelOf, currentTerm, previousTerm } from '../utils/terms';
import { toDay } from '../utils/dates';
import type { SavingsGoalRow, TransactionType } from '../types/db';

/**
 * The numbers POST /mcp hands to another app: totals per term, a monthly
 * baseline and goal progress. Totals and category names only — never a
 * transaction, a description or a merchant — so what reaches an outside model
 * is the shape of your money, not its details. Aggregated in SQL, unlike
 * /summary/rolling, which serialises every row (see Known gaps).
 */

export const REPORT_CURRENCY = 'CAD';
const TOP_CATEGORIES = 8;
const BASELINE_MONTHS = 12;
const DAY_MS = 86_400_000;

interface TotalRow {
  currency: string | null;
  type: TransactionType;
  category: string;
  total: string;
}

interface Totals {
  income: number;
  expenses: number;
  byCategory: Map<string, number>;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const daysBetween = (from: string, to: string): number => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS);
/** `'2026-05-01'` plus 27 days. A day string parses as UTC midnight and is printed in UTC, so no timezone enters. */
const addDays = (day: string, days: number): string => new Date(Date.parse(day) + days * DAY_MS).toISOString().slice(0, 10);

/** `(2026, 0)` -> `'2026-01-01'`, by arithmetic: never `new Date(y, m, d).toISOString()`. */
const monthStart = (absoluteMonth: number): string =>
  `${Math.floor(absoluteMonth / 12)}-${String((absoluteMonth % 12) + 1).padStart(2, '0')}-01`;

/** Income and spending in [start, end), converted to CAD, with spending by category. */
async function totalsBetween(userId: number, start: string, end: string): Promise<Totals> {
  const rows = await query<TotalRow>(
    `SELECT currency, type, category, SUM(amount) AS total
     FROM transactions
     WHERE user_id = $1 AND date >= $2 AND date < $3
     GROUP BY currency, type, category`,
    [userId, start, end]
  );
  const totals: Totals = { income: 0, expenses: 0, byCategory: new Map() };
  const rates = new Map<string, number>();
  for (const row of rows.rows) {
    const currency = row.currency || REPORT_CURRENCY;
    let rate = 1;
    if (currency !== REPORT_CURRENCY) {
      rate = rates.get(currency) ?? (await getExchangeRate(currency, REPORT_CURRENCY));
      rates.set(currency, rate);
    }
    const amount = Number(row.total) * rate;
    if (row.type === 'income') {
      totals.income += amount;
    } else {
      totals.expenses += amount;
      totals.byCategory.set(row.category, (totals.byCategory.get(row.category) ?? 0) + amount);
    }
  }
  return totals;
}

const topCategories = (byCategory: Map<string, number>) =>
  [...byCategory.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, TOP_CATEGORIES)
    .map(([category, amount]) => ({ category, amount: round2(amount) }));

/** Said with every term summary: the totals mix currencies through today's rate, which is not what anything cost on the day. */
export const CONVERSION_NOTE = 'Non-CAD amounts are converted to CAD at current exchange rates, not the rates on the day they were spent.';

const PACE_CAVEAT =
  'Compares recorded spending only. Adjacent terms often differ in kind — a study term and a co-op work term, or tuition paid in one and not the other — so a ratio above or below 1 is a difference, not a judgement.';

/** A run of days, half-open: `start` is in it, `end_exclusive` is not. */
interface Window {
  start: string;
  end_exclusive: string;
  /** Days in [start, end_exclusive). */
  days: number;
}

/** termSummary's `pace`, for the current term only. Amounts are CAD. */
interface Pace {
  /** The term compared with, e.g. 'Winter 2026': always the term just before, never the same term a year ago. */
  compared_with: string;
  /** What `compared_with` spent within `comparison_window`. */
  last_term_same_point: number;
  /** current_spending / last_term_same_point; null when the latter is 0, with `note` saying why. */
  ratio: number | null;
  /** What this term has spent within `current_window`; rows dated after today are not counted. */
  current_spending: number;
  /** This term from its first day through today. */
  current_window: Window;
  /** The previous term's first `current_window.days` days, or all of it when shorter (`clamped: true`). */
  comparison_window: Window & { clamped: boolean };
  /** Present when the ratio is missing or the window was clamped. */
  note?: string;
  /** That adjacent terms can differ in kind, so the ratio compares spending and judges nothing. */
  caveat: string;
}

/**
 * Spending so far this term against what the previous term had actually spent
 * by the same point — not a prorated share of its total: tuition and rent land
 * early, so a share would make every term's first weeks look like a spree.
 *
 * "The same point" is the first N days of the previous term, where N is the
 * days of this term so far counting today (the term's first day is day 1).
 * Terms differ in length — Winter 120 or 121 days, Spring 123, Fall 122 — so
 * when N runs past the previous term's end the window is that whole term, and
 * `clamped` says so. Every window is half-open, [start, end_exclusive), like
 * boundsOf. Day strings are stepped by UTC arithmetic, so only `today` — the
 * process's local day, as everywhere else — depends on the timezone.
 */
async function paceOf(userId: number, currentId: string, today: string): Promise<Pace> {
  const current = boundsOf(currentId);
  const previousId = previousTerm(currentId);
  const previous = boundsOf(previousId);
  const tomorrow = addDays(today, 1);
  const currentEnd = tomorrow < current.end ? tomorrow : current.end;
  const elapsed = daysBetween(current.start, currentEnd);
  const cutoff = addDays(previous.start, elapsed);
  const clamped = cutoff > previous.end;
  const comparisonEnd = clamped ? previous.end : cutoff;

  const spent = (await totalsBetween(userId, current.start, currentEnd)).expenses;
  const before = (await totalsBetween(userId, previous.start, comparisonEnd)).expenses;
  const label = labelOf(previousId);

  let note: string | undefined;
  if (before === 0) {
    note = spent === 0
      ? `No spending recorded so far this term or in the same window of ${label}, so there is nothing to compare.`
      : `No spending recorded in the same window of ${label}, so a ratio would be meaningless.`;
  } else if (clamped) {
    note = `This term is already longer than ${label} was, so the comparison is with all of ${label}.`;
  }

  return {
    // Named, so nobody reads "last term" as the same term a year ago.
    compared_with: label,
    last_term_same_point: round2(before),
    ratio: before > 0 ? round2(spent / before) : null,
    current_spending: round2(spent),
    current_window: { start: current.start, end_exclusive: currentEnd, days: elapsed },
    comparison_window: { start: previous.start, end_exclusive: comparisonEnd, days: daysBetween(previous.start, comparisonEnd), clamped },
    ...(note ? { note } : {}),
    caveat: PACE_CAVEAT,
  };
}

/** A term's totals. For the current term, how far in it is and how spending compares with last term at the same point. */
export async function termSummary(userId: number, which: 'current' | 'previous', now: Date = new Date()) {
  const current = currentTerm(now);
  const term = which === 'current' ? current : previousTerm(current);
  const { start, end } = boundsOf(term);
  const totals = await totalsBetween(userId, start, end);
  const today = toDay(now) as string;
  const daysTotal = daysBetween(start, end);
  const daysElapsed = which === 'current' ? Math.min(daysTotal, daysBetween(start, today) + 1) : daysTotal;
  const pace = which === 'current' ? await paceOf(userId, current, today) : null;

  return {
    term,
    label: labelOf(term),
    start,
    end_exclusive: end,
    days_elapsed: daysElapsed,
    days_total: daysTotal,
    currency: REPORT_CURRENCY,
    currency_note: CONVERSION_NOTE,
    income: round2(totals.income),
    expenses: round2(totals.expenses),
    net: round2(totals.income - totals.expenses),
    savings_rate: totals.income > 0 ? round2((totals.income - totals.expenses) / totals.income) : null,
    top_spending: topCategories(totals.byCategory),
    pace,
  };
}

/** Average monthly income and spending over the last 12 whole months: the numbers a retirement plan needs. */
export async function monthlyBaseline(userId: number, now: Date = new Date()) {
  const thisMonth = now.getFullYear() * 12 + now.getMonth();
  const start = monthStart(thisMonth - BASELINE_MONTHS);
  const end = monthStart(thisMonth);
  const totals = await totalsBetween(userId, start, end);
  const counted = await query<{ months: string }>(
    `SELECT COUNT(DISTINCT date_trunc('month', date)) AS months
     FROM transactions WHERE user_id = $1 AND date >= $2 AND date < $3`,
    [userId, start, end]
  );
  // Divide by the months that have any data, so an account opened in March
  // doesn't count January and February as months of spending nothing.
  const months = Number(counted.rows[0]?.months ?? 0);
  const per = (total: number): number | null => (months > 0 ? round2(total / months) : null);
  return {
    start,
    end_exclusive: end,
    months_with_data: months,
    currency: REPORT_CURRENCY,
    monthly_income: per(totals.income),
    monthly_spending: per(totals.expenses),
    monthly_saving: months > 0 ? round2((totals.income - totals.expenses) / months) : null,
  };
}

/** Each savings goal: how far along it is and what it needs per month to land on time. */
export async function goalProgress(userId: number, now: Date = new Date()) {
  const rows = await query<Pick<SavingsGoalRow, 'name' | 'target_amount' | 'current_amount' | 'target_date' | 'currency'>>(
    `SELECT name, target_amount, current_amount, target_date, currency
     FROM savings_goals WHERE user_id = $1 ORDER BY target_date NULLS LAST, id`,
    [userId]
  );
  const today = toDay(now) as string;
  return rows.rows.map((goal) => {
    const target = Number(goal.target_amount);
    const saved = Number(goal.current_amount ?? 0);
    const remaining = Math.max(0, target - saved);
    const due = toDay(goal.target_date);
    const daysLeft = due ? daysBetween(today, due) : null;
    const monthsLeft = daysLeft === null ? null : Math.max(0, daysLeft / 30.44);
    return {
      name: goal.name,
      currency: goal.currency,
      target: round2(target),
      saved: round2(saved),
      // Floored, so 99.6% never reads as 100 on a goal that isn't reached.
      percent: target > 0 ? Math.min(100, Math.floor((saved / target) * 100)) : null,
      target_date: due,
      status: remaining === 0 ? 'reached' : daysLeft === null ? 'no date' : daysLeft < 0 ? 'overdue' : 'in progress',
      // None for an overdue goal: "needs the whole rest this month" isn't a plan.
      needed_per_month: remaining === 0 || monthsLeft === null || (daysLeft ?? 0) < 0 ? null : round2(remaining / Math.max(1, monthsLeft)),
    };
  });
}
