import { addDays, daysBetween } from '../../utils/terms';
import { AgentError } from './types';
import { currencies, decimalCents, formatCents, validateDay } from './validation';

/**
 * calculate_scenario: a deterministic cash projection from inputs the model
 * states, so Pocky never does arithmetic itself. It reads no records and
 * stores nothing; the only outside input is the exchange rate for an event in
 * another currency, injected so tests are exact.
 *
 * Every amount is integer cents. Days are plain 'YYYY-MM-DD' strings stepped by
 * integer month arithmetic or addDays (UTC), never a local Date, so a month
 * bucket cannot shift with the host's timezone. Windows are half-open
 * [start, end_exclusive), like every other window the agent uses.
 */

export const MAX_SCENARIO_DAYS = 731;
export const MAX_SCENARIO_EVENTS = 40;
export const MAX_OCCURRENCES = 600;
const MAX_LABEL_CHARS = 60;

export type RateLookup = (from: string, to: string) => Promise<number>;

/** 'two_weeks' is biweekly pay: every 14 days from the event's date, 26 a year, not twice a month. */
interface Repeat { every: 'week' | 'two_weeks' | 'month'; until_exclusive: string }
interface ScenarioEvent { label: string; kind: 'income' | 'expense'; cents: number; currency: string; date: string; repeat: Repeat | null }
interface Scenario {
  currency: string; start: string; end_exclusive: string;
  startingCash: { cents: number; as_of: string } | null;
  reserve: number | null;
  events: ScenarioEvent[];
  goal: { target: number; current: number; deadline: string } | null;
}

const invalid = (): never => { throw new AgentError('agent_invalid_input'); };

function record(value: unknown, keys: string[], required: string[] = []): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid();
  const object = value as Record<string, unknown>;
  if (Object.keys(object).some(key => !keys.includes(key))) invalid();
  if (required.some(key => object[key] === undefined)) invalid();
  return object;
}

const currencyOf = (value: unknown): string => {
  if (typeof value !== 'string' || !currencies.includes(value)) invalid();
  return value as string;
};

function validate(raw: unknown, today: string): Scenario {
  const input = record(raw, ['currency', 'start', 'end_exclusive', 'starting_cash', 'reserve', 'events', 'goal'], ['currency', 'end_exclusive', 'events']);
  const currency = currencyOf(input.currency);
  const start = input.start === undefined ? validateDay(today) : validateDay(input.start);
  const end = validateDay(input.end_exclusive);
  const days = daysBetween(start, end);
  if (days < 1 || days > MAX_SCENARIO_DAYS) invalid();

  let startingCash: Scenario['startingCash'] = null;
  if (input.starting_cash !== undefined) {
    const cash = record(input.starting_cash, ['amount', 'as_of'], ['amount', 'as_of']);
    const asOf = validateDay(cash.as_of);
    if (asOf > start) invalid();
    startingCash = { cents: decimalCents(cash.amount, { min: -9_999_999_999, negative: true }), as_of: asOf };
  }
  const reserve = input.reserve === undefined ? null : decimalCents(input.reserve);

  if (!Array.isArray(input.events) || input.events.length < 1 || input.events.length > MAX_SCENARIO_EVENTS) invalid();
  const events = (input.events as unknown[]).map((item): ScenarioEvent => {
    const event = record(item, ['label', 'kind', 'amount', 'currency', 'date', 'repeat'], ['label', 'kind', 'amount', 'date']);
    if (typeof event.label !== 'string' || !event.label.trim() || event.label.length > MAX_LABEL_CHARS || event.label.includes('\0')) invalid();
    if (event.kind !== 'income' && event.kind !== 'expense') invalid();
    const date = validateDay(event.date);
    let repeat: Repeat | null = null;
    if (event.repeat !== undefined) {
      const r = record(event.repeat, ['every', 'until_exclusive'], ['every', 'until_exclusive']);
      if (r.every !== 'week' && r.every !== 'two_weeks' && r.every !== 'month') invalid();
      const until = validateDay(r.until_exclusive);
      if (until <= date) invalid();
      repeat = { every: r.every as Repeat['every'], until_exclusive: until };
    }
    return {
      label: (event.label as string).trim(), kind: event.kind as ScenarioEvent['kind'],
      cents: decimalCents(event.amount, { min: 1 }),
      currency: event.currency === undefined ? currency : currencyOf(event.currency),
      date, repeat,
    };
  });

  let goal: Scenario['goal'] = null;
  if (input.goal !== undefined) {
    const g = record(input.goal, ['target_amount', 'current_amount', 'deadline'], ['target_amount', 'current_amount', 'deadline']);
    goal = { target: decimalCents(g.target_amount, { min: 1 }), current: decimalCents(g.current_amount), deadline: validateDay(g.deadline) };
  }
  return { currency, start, end_exclusive: end, startingCash, reserve, events, goal };
}

const isLeap = (year: number): boolean => (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
export const daysInMonth = (year: number, month: number): number =>
  [31, isLeap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1]!;
const pad = (n: number): string => String(n).padStart(2, '0');
const parts = (day: string): [number, number, number] => [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];

/** The n-th monthly repeat of `anchor`, keeping its day of month and clamping it to the month's end: Jan 31 -> Feb 28 (29 in a leap year) -> Mar 31. */
export function addMonthsClamped(anchor: string, n: number): string {
  const [year, month, day] = parts(anchor);
  const absolute = year * 12 + (month - 1) + n;
  const y = Math.floor(absolute / 12);
  const m = (absolute % 12) + 1;
  return `${y}-${pad(m)}-${pad(Math.min(day, daysInMonth(y, m)))}`;
}

/** Whole calendar months from `from` to `to`: 2026-10-14 -> 2027-04-14 is 6, -> 2027-04-13 is 5, and never negative. */
export function fullMonthsBetween(from: string, to: string): number {
  if (to <= from) return 0;
  const [fy, fm, fd] = parts(from);
  const [ty, tm, td] = parts(to);
  return Math.max(0, (ty * 12 + tm) - (fy * 12 + fm) - (td < fd ? 1 : 0));
}

/** Every date an event falls on, split into those inside [start, end) and counts of those outside. */
function occurrencesOf(event: ScenarioEvent, start: string, end: string, budget: number) {
  const inside: string[] = [];
  let before = 0; let after = 0;
  const visit = (date: string) => {
    if (date < start) before++;
    else if (date >= end) after++;
    else { inside.push(date); if (inside.length > budget) invalid(); }
  };
  if (!event.repeat) { visit(event.date); return { inside, before, after }; }
  // Bounded: dates are 1900-2100, so at most about 10,500 weekly steps.
  for (let n = 0; ; n++) {
    const every = event.repeat.every;
    const date = every === 'month' ? addMonthsClamped(event.date, n) : addDays(event.date, (every === 'week' ? 7 : 14) * n);
    if (date >= event.repeat.until_exclusive) break;
    visit(date);
  }
  return { inside, before, after };
}

const monthOfDay = (day: string): string => day.slice(0, 7);

/** Each 'YYYY-MM' the window touches, in order. */
function monthsOf(start: string, end: string): string[] {
  const last = monthOfDay(addDays(end, -1));
  const months: string[] = [];
  for (let n = 0; ; n++) {
    const month = monthOfDay(addMonthsClamped(`${start.slice(0, 7)}-01`, n));
    months.push(month);
    if (month === last) return months;
  }
}

export async function calculateScenario(raw: unknown, today: string, rate: RateLookup) {
  const s = validate(raw, today);

  // One rate per currency, fetched before any arithmetic. A missing rate is an
  // error the model must report, never a silent 1.
  const rates = new Map<string, number>();
  for (const from of [...new Set(s.events.map(e => e.currency))].filter(c => c !== s.currency).sort()) {
    let value: number;
    try { value = await rate(from, s.currency); } catch { throw new AgentError('agent_rate_unavailable', 503); }
    if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) throw new AgentError('agent_rate_unavailable', 503);
    rates.set(from, value);
  }

  const occurrences: Array<{ date: string; kind: ScenarioEvent['kind']; cents: number }> = [];
  const ignored: Array<{ label: string; before_start: number; after_end: number }> = [];
  // Per input event, in input order: how often it lands inside the window, so a
  // count of paydays is quoted from here rather than counted by the model.
  const eventCounts: Array<{ index: number; label: string; kind: ScenarioEvent['kind']; occurrences: number; first_date: string | null; last_date: string | null }> = [];
  for (const [index, event] of s.events.entries()) {
    // Converted once per event, so every occurrence of it carries the same cents.
    const cents = event.currency === s.currency ? event.cents : Math.round(event.cents * rates.get(event.currency)!);
    const found = occurrencesOf(event, s.start, s.end_exclusive, MAX_OCCURRENCES - occurrences.length);
    for (const date of found.inside) occurrences.push({ date, kind: event.kind, cents });
    // found.inside is in date order: repeats only step forward.
    eventCounts.push({ index, label: event.label, kind: event.kind, occurrences: found.inside.length, first_date: found.inside[0] ?? null, last_date: found.inside.at(-1) ?? null });
    if (found.before || found.after) ignored.push({ label: event.label, before_start: found.before, after_end: found.after });
  }
  occurrences.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));

  const months = new Map(monthsOf(s.start, s.end_exclusive).map(month => [month, { income: 0, expenses: 0 }]));
  let income = 0; let expenses = 0;
  for (const o of occurrences) {
    const bucket = months.get(monthOfDay(o.date))!;
    if (o.kind === 'income') { bucket.income += o.cents; income += o.cents; } else { bucket.expenses += o.cents; expenses += o.cents; }
  }

  // Balances are end-of-day: every event on a day lands before the day's balance is read.
  const cash = s.startingCash?.cents ?? null;
  let lowest: { cents: number; date: string } | null = null;
  let firstBreach: string | null = null;
  if (cash !== null) {
    // The start day is read after its own events, like every other day.
    const net = new Map<string, number>([[s.start, 0]]);
    for (const o of occurrences) net.set(o.date, (net.get(o.date) ?? 0) + (o.kind === 'income' ? o.cents : -o.cents));
    let balance = cash;
    for (const [date, change] of net) {
      balance += change;
      if (lowest === null || balance < lowest.cents) lowest = { cents: balance, date };
      if (s.reserve !== null && firstBreach === null && balance < s.reserve) firstBreach = date;
    }
  }

  let running = cash;
  const byMonth = [...months.entries()].map(([month, m]) => {
    if (running !== null) running += m.income - m.expenses;
    return { month, income: formatCents(m.income), expenses: formatCents(m.expenses), net: formatCents(m.income - m.expenses), closing_balance: running === null ? null : formatCents(running) };
  });

  const notes = ['A projection from the stated inputs only: an estimate, not a forecast of recorded transactions and not financial advice.'];
  const missing: string[] = [];
  if (cash === null) {
    missing.push('starting_cash');
    notes.push('No starting cash was given, so there are no balances: do not say anything is affordable. Ask for the cash on hand.');
  } else {
    notes.push('Balances are end-of-day, in the scenario currency.');
    if (s.startingCash!.as_of < s.start) notes.push(`Starting cash is as of ${s.startingCash!.as_of}; anything between then and ${s.start} is not included.`);
  }
  if (rates.size) notes.push(`Amounts in ${[...rates.keys()].join(', ')} were converted to ${s.currency} at current exchange rates, not the rates on the dates of the events.`);
  if (ignored.length) notes.push('Some event dates fall outside the window and were ignored; see ignored.');

  let goal = null;
  if (s.goal) {
    const remaining = Math.max(0, s.goal.target - s.goal.current);
    const monthsLeft = fullMonthsBetween(s.start, s.goal.deadline);
    // Rounded up to the cent, so paying monthly_needed every month always reaches the target.
    const needed = monthsLeft === 0 ? remaining : Math.floor((remaining + monthsLeft - 1) / monthsLeft);
    // Covered only when the window reaches the deadline: events through the deadline day itself count.
    const throughDeadline = addDays(s.goal.deadline, 1);
    const covered = remaining === 0 ? true : throughDeadline > s.end_exclusive ? null
      : occurrences.filter(o => o.date < throughDeadline).reduce((net, o) => net + (o.kind === 'income' ? o.cents : -o.cents), 0) >= remaining;
    goal = { remaining: formatCents(remaining), months_left: monthsLeft, monthly_needed: formatCents(needed), covered_by_projected_net: covered };
    notes.push(covered === null
      ? 'The window ends before the goal deadline, so whether projected net flow covers the goal is unknown.'
      : 'covered_by_projected_net compares projected income minus expenses through the deadline with the remaining amount; goal progress is not cash, and nothing is set aside.');
  }

  return {
    currency: s.currency,
    window: { start: s.start, end_exclusive: s.end_exclusive, days: daysBetween(s.start, s.end_exclusive) },
    starting_cash: s.startingCash ? { amount: formatCents(s.startingCash.cents), as_of: s.startingCash.as_of } : null,
    totals: { income: formatCents(income), expenses: formatCents(expenses), net: formatCents(income - expenses) },
    by_month: byMonth,
    lowest: lowest ? { balance: formatCents(lowest.cents), date: lowest.date } : null,
    reserve: s.reserve === null ? null : {
      amount: formatCents(s.reserve),
      // Unknown without cash; zero when the balance never dips below the reserve.
      shortfall: lowest === null ? null : formatCents(Math.max(0, s.reserve - lowest.cents)),
      first_breach_date: firstBreach,
    },
    goal,
    status: missing.length ? 'incomplete' as const : 'complete' as const,
    missing,
    occurrences: occurrences.length,
    event_counts: eventCounts,
    ignored,
    rates: [...rates.entries()].map(([from, value]) => ({ from, to: s.currency, rate: value })),
    notes,
  };
}
