/**
 * Calendar days, as the API and the database both hold them: 'YYYY-MM-DD'.
 *
 * db/connection.js registers a pg type parser so a DATE column arrives as that
 * string rather than a JS Date. Nothing downstream should turn one back into a
 * Date to read its parts — `new Date('2026-08-01').getMonth()` is July for
 * every reader west of UTC, which is how a whole month's transactions end up
 * filed under the month before. These helpers work on the string.
 *
 * utils/terms.js owns term boundaries and accepts these strings directly.
 */

// A prefix match, so a full timestamp is accepted too. Rows written before the
// type parser existed, and any caller still passing a Date, both still work.
const DAY = /^(\d{4})-(\d{2})-(\d{2})/;

/**
 * The 'YYYY-MM-DD' day of a value, or null if it does not carry one.
 * Accepts a day string, an ISO timestamp, or a Date.
 */
function toDay(value) {
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDay(value.getFullYear(), value.getMonth(), value.getDate());
  }
  const match = DAY.exec(String(value ?? ''));
  return match ? match[0] : null;
}

/** The 'YYYY-MM' a day falls in — the month key used by the summary views. */
function monthOf(value) {
  const day = toDay(value);
  return day ? day.slice(0, 7) : null;
}

/**
 * A day rendered the way `toLocaleDateString()` renders one under en-US, which
 * is what the report emails used to print, minus the day it used to lose.
 */
function formatDay(value, fallback = '-') {
  const day = toDay(value);
  if (!day) return fallback;
  const [year, month, date] = day.split('-');
  return `${Number(month)}/${Number(date)}/${year}`;
}

/** Whole months between two 'YYYY-MM' keys, counting both ends. */
function monthSpan(fromMonth, toMonth) {
  const absolute = (key) => {
    const [year, month] = key.split('-').map(Number);
    return year * 12 + (month - 1);
  };
  return absolute(toMonth) - absolute(fromMonth) + 1;
}

const pad2 = (n) => String(n).padStart(2, '0');
const isoDay = (year, monthIndex, date) => `${year}-${pad2(monthIndex + 1)}-${pad2(date)}`;

module.exports = { toDay, monthOf, formatDay, monthSpan };
