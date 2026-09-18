/**
 * Calendar days, as the API and the database both hold them: 'YYYY-MM-DD'.
 *
 * db/connection.ts registers a pg type parser so a DATE column arrives as that
 * string rather than a JS Date. Nothing downstream should turn one back into a
 * Date to read its parts — `new Date('2026-08-01').getMonth()` is July for
 * every reader west of UTC, which is how a whole month's transactions end up
 * filed under the month before. These helpers work on the string.
 *
 * utils/terms.ts owns term boundaries and accepts these strings directly.
 */

// A prefix match, so a full timestamp is accepted too. Rows written before the
// type parser existed, and any caller still passing a Date, both still work.
const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The 'YYYY-MM-DD' day of a value, or null if it does not carry one.
 * Accepts a day string, an ISO timestamp, or a Date.
 */
export function toDay(value: unknown): string | null {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDay(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = DAY.exec(String(value ?? ''));
  return match?.[0] ?? null;
}

/** The 'YYYY-MM' a day falls in — the month key used by the summary views. */
export function monthOf(value: unknown): string | null {
  const day = toDay(value);
  return day ? day.slice(0, 7) : null;
}

/**
 * A day rendered the way `toLocaleDateString()` renders one under en-US, which
 * is what the report emails used to print, minus the day it used to lose.
 */
export function formatDay(value: unknown, fallback: string = '-'): string {
  const day = toDay(value);
  if (!day) return fallback;
  const [year, month, date] = day.split('-');
  return `${Number(month)}/${Number(date)}/${year}`;
}

/** Whole months between two 'YYYY-MM' keys, counting both ends. */
export function monthSpan(fromMonth: string, toMonth: string): number {
  const absolute = (key: string): number => {
    const [yearPart, monthPart] = key.split('-');
    return Number(yearPart) * 12 + (Number(monthPart) - 1);
  };
  return absolute(toMonth) - absolute(fromMonth) + 1;
}

const pad2 = (n: number): string => String(n).padStart(2, '0');
const isoDay = (year: number, monthIndex: number, date: number): string =>
  `${year}-${pad2(monthIndex + 1)}-${pad2(date)}`;
