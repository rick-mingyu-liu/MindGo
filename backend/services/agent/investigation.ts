import { createHash } from 'node:crypto';
import { query } from '../../db/connection';
import { groupedBetween, RateUnavailableError } from '../moneyFacts';
import { daysBetween } from '../../utils/terms';
import type { TransactionRow, TransactionType } from '../../types/db';
import { AgentError, type AgentRecords, type CompareInput, type DetailsInput, type RecordWindow, type SummaryInput } from './types';
import { categories, currencies, validateDay } from './validation';

/**
 * Pocky's read-only view of one user's own records: totals for a window, two
 * windows compared, and a bounded page of rows. Every function takes the user
 * id from the server (the route binds req.user.userId); nothing the model sends
 * can name another user. Totals aggregate in SQL like moneyFacts; arithmetic on
 * the aggregates is in integer cents so the answer the model quotes is exact.
 */

/** Five years, counting a leap day: the longest window any tool will read. */
export const MAX_WINDOW_DAYS = 1827;
export const MAX_DETAIL_ROWS = 25;
const DEFAULT_DETAIL_ROWS = 15;
/** Longest description handed to the model, in characters, including the ellipsis. */
export const MAX_DESCRIPTION_CHARS = 80;

const invalid = (): never => { throw new AgentError('agent_invalid_input'); };
const toCents = (amount: number): number => Math.round(amount * 100);
const fromCents = (cents: number): number => cents / 100;
const ratioOf = (to: number, from: number): number | null => (from > 0 ? Math.round((to / from) * 100) / 100 : null);

interface Window extends RecordWindow { days: number }

function windowOf(value: unknown): Window {
  if (!value || typeof value !== 'object') invalid();
  const { start, end_exclusive: end } = value as Record<string, unknown>;
  const from = validateDay(start);
  const to = validateDay(end);
  const days = daysBetween(from, to);
  if (days < 1 || days > MAX_WINDOW_DAYS) invalid();
  return { start: from, end_exclusive: to, days };
}

function currencyOf(value: unknown): string {
  if (typeof value !== 'string' || !currencies.includes(value)) invalid();
  return value as string;
}

function typeOf(value: unknown): TransactionType {
  if (value !== 'income' && value !== 'expense') invalid();
  return value as TransactionType;
}

function categoryOf(value: unknown): string {
  if (typeof value !== 'string' || ![...categories.income, ...categories.expense].includes(value)) invalid();
  return value as string;
}

/** Said whenever a total mixes currencies: the rate is today's, not the day's. */
const conversionNote = (from: string[], to: string): string | null =>
  from.length === 0 ? null : `Amounts recorded in ${from.join(', ')} were converted to ${to} at current exchange rates, not the rates on the dates of the transactions.`;

interface CategoryCents { category: string; type: TransactionType; cents: number; count: number }
interface WindowCents { window: Window; income: number; expenses: number; count: number; categories: CategoryCents[]; convertedFrom: string[] }

async function centsIn(userId: number, window: Window, currency: string): Promise<WindowCents> {
  let groups;
  try {
    groups = await groupedBetween(userId, window.start, window.end_exclusive, currency);
  } catch (error) {
    if (error instanceof RateUnavailableError) throw new AgentError('agent_rate_unavailable', 503);
    throw error;
  }
  const byCategory = new Map<string, CategoryCents>();
  const convertedFrom = new Set<string>();
  let income = 0; let expenses = 0; let count = 0;
  for (const group of groups) {
    if (group.currency !== currency) convertedFrom.add(group.currency);
    // Each group is rounded to cents once, so the totals are exactly the sum of the categories.
    const cents = toCents(group.amount);
    const key = `${group.type}|${group.category}`;
    const entry = byCategory.get(key) ?? { category: group.category, type: group.type, cents: 0, count: 0 };
    entry.cents += cents; entry.count += group.count;
    byCategory.set(key, entry);
    if (group.type === 'income') income += cents; else expenses += cents;
    count += group.count;
  }
  const sorted = [...byCategory.values()].sort((x, y) => y.cents - x.cents || x.category.localeCompare(y.category) || x.type.localeCompare(y.type));
  return { window, income, expenses, count, categories: sorted, convertedFrom: [...convertedFrom].sort() };
}

export async function spendingSummary(userId: number, input: SummaryInput) {
  const window = windowOf(input);
  const currency = currencyOf(input.currency);
  const totals = await centsIn(userId, window, currency);
  return {
    window,
    currency,
    income: fromCents(totals.income),
    expenses: fromCents(totals.expenses),
    net: fromCents(totals.income - totals.expenses),
    by_category: totals.categories.map(c => ({ category: c.category, type: c.type, amount: fromCents(c.cents), count: c.count })),
    transaction_count: totals.count,
    converted_from: totals.convertedFrom,
    conversion_note: conversionNote(totals.convertedFrom, currency),
  };
}

/** Window b against window a: every difference is b − a, every ratio b / a, and no ratio where a is zero. */
export async function compareSpending(userId: number, input: CompareInput) {
  if (!input || typeof input !== 'object') invalid();
  const a = windowOf(input.a);
  const b = windowOf(input.b);
  const currency = currencyOf(input.currency);
  const first = await centsIn(userId, a, currency);
  const second = await centsIn(userId, b, currency);
  const totals = (t: WindowCents) => ({ window: t.window, income: fromCents(t.income), expenses: fromCents(t.expenses), net: fromCents(t.income - t.expenses), transaction_count: t.count });
  const keys = new Map<string, { category: string; type: TransactionType; a: number; b: number }>();
  for (const [side, t] of [['a', first], ['b', second]] as const) {
    for (const c of t.categories) {
      const key = `${c.type}|${c.category}`;
      const entry = keys.get(key) ?? { category: c.category, type: c.type, a: 0, b: 0 };
      entry[side] += c.cents;
      keys.set(key, entry);
    }
  }
  const byCategory = [...keys.values()]
    .sort((x, y) => Math.abs(y.b - y.a) - Math.abs(x.b - x.a) || x.category.localeCompare(y.category) || x.type.localeCompare(y.type))
    .map(c => ({
      category: c.category, type: c.type, a: fromCents(c.a), b: fromCents(c.b), difference: fromCents(c.b - c.a), ratio: ratioOf(c.b, c.a),
      ...(c.a === 0 ? { note: 'Nothing recorded in window a, so there is no ratio.' } : {}),
    }));
  const convertedFrom = [...new Set([...first.convertedFrom, ...second.convertedFrom])].sort();
  const expensesRatio = ratioOf(second.expenses, first.expenses);
  return {
    currency,
    a: totals(first),
    b: totals(second),
    difference: {
      income: fromCents(second.income - first.income),
      expenses: fromCents(second.expenses - first.expenses),
      net: fromCents((second.income - second.expenses) - (first.income - first.expenses)),
    },
    expenses_ratio: expensesRatio,
    ...(expensesRatio === null ? { note: 'No spending recorded in window a, so there is no spending ratio.' } : {}),
    by_category: byCategory,
    converted_from: convertedFrom,
    conversion_note: conversionNote(convertedFrom, currency),
  };
}

/** Binds a cursor to the query that issued it, so one cannot be replayed against other filters. */
const fingerprint = (window: RecordWindow, category: string | null, type: string | null): string =>
  createHash('sha256').update(JSON.stringify([window.start, window.end_exclusive, category, type])).digest('base64url').slice(0, 16);

function encodeCursor(date: string, id: number, print: string): string {
  return Buffer.from(JSON.stringify({ d: date, i: id, f: print })).toString('base64url');
}

function decodeCursor(value: unknown, window: Window, print: string): { date: string; id: number } {
  if (typeof value !== 'string' || value.length > 200 || !/^[A-Za-z0-9_-]+$/.test(value)) invalid();
  let parsed: unknown;
  try { parsed = JSON.parse(Buffer.from(value as string, 'base64url').toString('utf8')); } catch { invalid(); }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) invalid();
  const { d, i, f } = parsed as Record<string, unknown>;
  if (f !== print || typeof i !== 'number' || !Number.isSafeInteger(i) || i < 1) invalid();
  const date = validateDay(d);
  if (date < window.start || date >= window.end_exclusive) invalid();
  return { date, id: i as number };
}

/**
 * A description as the model sees it: written by whoever named the payment
 * (a bank memo, an import), so it is data, never an instruction. Control
 * characters and bidi overrides become spaces so nothing hides or reorders
 * text, and it is clipped so a page of rows stays inside the tool budget.
 */
function untrustedDescription(value: string): string {
  // Matching control characters is the point of this pattern.
  // eslint-disable-next-line no-control-regex
  const chars = Array.from(value.replace(/[\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/g, ' '));
  return chars.length <= MAX_DESCRIPTION_CHARS ? chars.join('') : `${chars.slice(0, MAX_DESCRIPTION_CHARS - 1).join('')}\u2026`;
}

const amountText = (amount: string): string => (/^-?\d+\.\d{2}$/.test(amount) ? amount : Number(amount).toFixed(2));

/** A page of rows, newest first, keyset-paginated on (date, id). Amounts stay in the currency each row was recorded in. */
export async function transactionDetails(userId: number, input: DetailsInput) {
  if (!input || typeof input !== 'object') invalid();
  const window = windowOf(input);
  const category = input.category === undefined ? null : categoryOf(input.category);
  const type = input.type === undefined ? null : typeOf(input.type);
  if (category && type && !categories[type].includes(category)) invalid();
  const limit = input.limit === undefined ? DEFAULT_DETAIL_ROWS : input.limit;
  if (typeof limit !== 'number' || !Number.isInteger(limit) || limit < 1 || limit > MAX_DETAIL_ROWS) invalid();
  const print = fingerprint(window, category, type);
  const after = input.cursor === undefined ? null : decodeCursor(input.cursor, window, print);

  const params: unknown[] = [userId, window.start, window.end_exclusive];
  let sql = `SELECT id, date, type, amount, currency, category, description
     FROM transactions
     WHERE user_id = $1 AND date >= $2 AND date < $3`;
  if (category) { params.push(category); sql += ` AND category = $${params.length}`; }
  if (type) { params.push(type); sql += ` AND type = $${params.length}`; }
  if (after) { params.push(after.date, after.id); sql += ` AND (date, id) < ($${params.length - 1}::date, $${params.length})`; }
  // One extra row says whether another page exists without a COUNT.
  params.push(limit + 1);
  sql += ` ORDER BY date DESC, id DESC LIMIT $${params.length}`;

  const result = await query<Pick<TransactionRow, 'id' | 'date' | 'type' | 'amount' | 'currency' | 'category' | 'description'>>(sql, params);
  const page = result.rows.slice(0, limit);
  const last = page.at(-1);
  const more = result.rows.length > limit && last !== undefined;
  return {
    window,
    rows: page.map(row => ({ id: row.id, date: row.date, type: row.type, amount: amountText(String(row.amount)), currency: row.currency || 'CAD', category: row.category, description_untrusted: untrustedDescription(row.description) })),
    next_cursor: more ? encodeCursor(last.date, last.id, print) : null,
    truncated: more,
  };
}

/** The three views bound to one user, for the agent runtime. */
export function recordsFor(userId: number): AgentRecords {
  return {
    spendingSummary: input => spendingSummary(userId, input),
    compareSpending: input => compareSpending(userId, input),
    transactionDetails: input => transactionDetails(userId, input),
  };
}
