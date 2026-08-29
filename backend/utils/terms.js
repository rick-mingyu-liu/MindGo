/**
 * The Waterloo term calendar.
 *
 * A term is four months: **Winter** Jan–Apr, **Spring** May–Aug, **Fall**
 * Sep–Dec. This is the unit the app is actually about — a co-op term is one
 * term, and budgeting across one is the thing it exists to do.
 *
 * This module exists so there is exactly **one** definition of where a term
 * starts. Two callers need it and they must agree: the summary views, which
 * show a term, and the retention job, which deletes whole terms. If each
 * computed its own boundaries the two would drift silently, and the drift would
 * only surface when a chart and a deletion disagreed about where Spring began.
 * The same failure exists in a different place — a seed file and a category
 * list that nothing kept in step.
 *
 * ## Two design points worth not undoing
 *
 * **Bounds are half-open, `[start, end)`.** `boundsOf('2026-spring')` is
 * `2026-05-01` to `2026-09-01`, and September 1st is *not* in Spring. This
 * matches the query `summaryController` already runs
 * (`date >= $2 AND date < $3`) and removes every end-of-month and leap-day
 * question: consecutive terms simply share a boundary.
 *
 * **No dates are built with `new Date(y, m, d).toISOString()`.** That is the
 * pattern `getRollingSummary` uses today, and it is off by a day in any
 * timezone east of UTC: under `TZ=Asia/Shanghai`, `new Date(2026, 4, 1)` is
 * local midnight on May 1, which is `2026-04-30T16:00Z`, so `toISOString()`
 * yields **`2026-04-30`**. It happens not to bite because the server runs UTC.
 * Everything here is integer arithmetic formatted into a string, so the output
 * does not depend on the process timezone at all — `test/terms.test.js` is run
 * under three timezones to hold that.
 */

// Order matters: index is the term's position within the year.
const TERMS = [
  { key: 'winter', label: 'Winter', startMonth: 0 },  // Jan, Feb, Mar, Apr
  { key: 'spring', label: 'Spring', startMonth: 4 },  // May, Jun, Jul, Aug
  { key: 'fall',   label: 'Fall',   startMonth: 8 },  // Sep, Oct, Nov, Dec
];

const MONTHS_PER_TERM = 4;
const TERMS_PER_YEAR = TERMS.length;
const TERM_ID = /^(\d{4})-(winter|spring|fall)$/;

const pad2 = (n) => String(n).padStart(2, '0');

/** `(2026, 4, 1)` -> `'2026-05-01'`. month is 0-based, as in `Date`. */
const isoDate = (year, month, day) => `${year}-${pad2(month + 1)}-${pad2(day)}`;

/** Term id from its parts: `(2026, 1)` -> `'2026-spring'`. */
const idOf = (year, index) => `${year}-${TERMS[index].key}`;

/**
 * Accepts a `Date` or a `'YYYY-MM-DD'` string.
 *
 * For a `Date`, the **local** year and month are read, not the UTC ones. That
 * is deliberate: `pg` materialises a `DATE` column as local midnight, so a row
 * dated 2025-03-01 arrives as `2025-03-01T05:00:00Z` in Toronto. Reading it
 * with `getUTCMonth()` would be right there and wrong elsewhere; reading it
 * locally round-trips whatever `pg` produced.
 */
function partsOf(date) {
  if (typeof date === 'string') {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date);
    if (!m) throw new TypeError(`Not a YYYY-MM-DD date: ${date}`);
    return { year: Number(m[1]), month: Number(m[2]) - 1 };
  }
  if (date instanceof Date && !Number.isNaN(date.getTime())) {
    return { year: date.getFullYear(), month: date.getMonth() };
  }
  throw new TypeError(`Not a date: ${String(date)}`);
}

/** `true` for a well-formed id like `'2026-spring'`. Use before `boundsOf`. */
function isTermId(value) {
  return typeof value === 'string' && TERM_ID.test(value);
}

function parseTermId(termId) {
  const m = TERM_ID.exec(String(termId));
  if (!m) throw new TypeError(`Not a term id: ${String(termId)}`);
  return { year: Number(m[1]), index: TERMS.findIndex((t) => t.key === m[2]) };
}

/** Which term a date falls in. `'2026-06-15'` -> `'2026-spring'`. */
function termOf(date) {
  const { year, month } = partsOf(date);
  return idOf(year, Math.floor(month / MONTHS_PER_TERM));
}

/**
 * Half-open bounds, as `YYYY-MM-DD` strings ready for a parameterised query:
 * `{ start: '2026-05-01', end: '2026-09-01' }`. Fall rolls into January of the
 * following year.
 */
function boundsOf(termId) {
  const { year, index } = parseTermId(termId);
  const startMonth = TERMS[index].startMonth;
  const endAbsolute = startMonth + MONTHS_PER_TERM;
  return {
    start: isoDate(year, startMonth, 1),
    end: isoDate(year + Math.floor(endAbsolute / 12), endAbsolute % 12, 1),
  };
}

/** `'2026-spring'` -> `'Spring 2026'`, for a chart title. */
function labelOf(termId) {
  const { year, index } = parseTermId(termId);
  return `${TERMS[index].label} ${year}`;
}

/** Absolute term number since year 0, so terms can be compared and stepped. */
const ordinalOf = (year, index) => year * TERMS_PER_YEAR + index;

function fromOrdinal(ordinal) {
  return idOf(Math.floor(ordinal / TERMS_PER_YEAR), ordinal % TERMS_PER_YEAR);
}

function shiftTerm(termId, by) {
  const { year, index } = parseTermId(termId);
  return fromOrdinal(ordinalOf(year, index) + by);
}

/** `'2026-winter'` -> `'2025-fall'`. Crosses the year boundary correctly. */
const previousTerm = (termId) => shiftTerm(termId, -1);
const nextTerm = (termId) => shiftTerm(termId, 1);

function currentTerm(now = new Date()) {
  return termOf(now);
}

/**
 * The last `n` terms, oldest first, **including the current one**.
 *
 * This is what the retention job wants: `lastNTerms(6)` is two years, and
 * `boundsOf(...)[0].start` is the cutoff. Deleting below a term's start is what
 * makes "delete only whole terms" true by construction rather than by comment —
 * a rolling 24-month cutoff would slice a term in half and leave a chart
 * showing a partial term's spending as if it were the whole thing.
 */
function lastNTerms(n, now = new Date()) {
  if (!Number.isInteger(n) || n < 1) {
    throw new RangeError(`lastNTerms needs a positive whole number, got ${String(n)}`);
  }
  const current = currentTerm(now);
  const out = [];
  for (let i = n - 1; i >= 0; i--) out.push(shiftTerm(current, -i));
  return out;
}

/**
 * ## Years
 *
 * A year needs no separate calendar. The three terms tile Jan–Dec exactly, so
 * a calendar year *is* three terms — Winter, Spring and Fall of that year —
 * and "this year" and "the terms in this year" can never disagree about a
 * boundary. That is the whole reason the yearly view is expressed here rather
 * than as its own month arithmetic somewhere in the controller.
 */

/** The four months of a term, each as its first day. The seed builds on these. */
function monthsOf(termId) {
  const { year, index } = parseTermId(termId);
  const startMonth = TERMS[index].startMonth;
  return Array.from({ length: MONTHS_PER_TERM }, (_, i) => {
    const absolute = startMonth + i;
    return isoDate(year + Math.floor(absolute / 12), absolute % 12, 1);
  });
}

const YEAR_ID = /^\d{4}$/;

/** True for '2026'. Deliberately not true for 2026 the number: ids are strings. */
function isYearId(value) {
  return typeof value === 'string' && YEAR_ID.test(value);
}

function parseYearId(yearId) {
  if (!isYearId(String(yearId))) throw new TypeError(`Not a year id: ${String(yearId)}`);
  return Number(yearId);
}

/** Half-open, like boundsOf: '2026' is 2026-01-01 up to but not including 2027-01-01. */
function yearBoundsOf(yearId) {
  const year = parseYearId(yearId);
  return { start: isoDate(year, 0, 1), end: isoDate(year + 1, 0, 1) };
}

function yearLabelOf(yearId) {
  return String(parseYearId(yearId));
}

/** The three terms of a year, in order. The yearly view's term axis. */
function termsOfYear(yearId) {
  const year = parseYearId(yearId);
  return TERMS.map((_, index) => idOf(year, index));
}

function currentYear(now = new Date()) {
  return String(partsOf(now).year);
}

function shiftYear(yearId, by) {
  return String(parseYearId(yearId) + by);
}

const previousYear = (yearId) => shiftYear(yearId, -1);

module.exports = {
  TERMS,
  MONTHS_PER_TERM,
  isTermId,
  termOf,
  boundsOf,
  labelOf,
  currentTerm,
  previousTerm,
  nextTerm,
  lastNTerms,
  monthsOf,
  isYearId,
  yearBoundsOf,
  yearLabelOf,
  termsOfYear,
  currentYear,
  previousYear,
};
