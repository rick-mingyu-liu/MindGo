/**
 * Values read out of OCR text: amounts and days.
 *
 * Everything here works on strings. An amount stays a two-decimal string and a
 * day stays 'YYYY-MM-DD' from the moment it is read until the INSERT, so no
 * float rounding and no server timezone can change what the screenshot said.
 */

// Letters OCR commonly returns in place of digits. Applied only inside a token
// that already has the shape of an amount, never to free text.
const DIGIT_REPAIRS = { O: '0', o: '0', l: '1', I: '1', S: '5', B: '8' };
const DIGITISH = '[0-9OolISB]';
const GROUPED = new RegExp(`^${DIGITISH}{1,3}(?:,${DIGITISH}{3})+\\.${DIGITISH}{2}$`);
const PLAIN = new RegExp(`^${DIGITISH}+\\.${DIGITISH}{2}$`);

/**
 * Reads one amount token. Returns null for anything that is not unambiguously
 * an amount with cents — rejecting beats misreading.
 *
 * @returns {{ value: string, sign: -1|1|null, currency: 'USD'|null, corrected: boolean } | null}
 */
function parseAmount(text) {
  let s = String(text ?? '').trim();
  let sign = null;
  let currency = null;

  const credit = /\s*CR$/i;
  if (credit.test(s)) {
    sign = 1;
    s = s.replace(credit, '');
  }
  const paren = /^\((.*)\)$/.exec(s);
  if (paren) {
    sign = -1;
    s = paren[1].trim();
  }

  // A sign and a currency marker can come in either order: -$12.50, $-12.50.
  for (let changed = true; changed;) {
    changed = false;
    const signMatch = /^([+\-−–])\s*/.exec(s);
    if (signMatch) {
      if (sign === null) sign = signMatch[1] === '+' ? 1 : -1;
      s = s.slice(signMatch[0].length);
      changed = true;
    }
    const marker = /^(US\$|USD|CA\$|C\$|CAD|\$)\s*/i.exec(s);
    if (marker) {
      if (/^US/i.test(marker[1])) currency = 'USD';
      s = s.slice(marker[0].length);
      changed = true;
    }
  }
  const code = /\s*(USD|CAD)$/i.exec(s);
  if (code) {
    if (code[1].toUpperCase() === 'USD') currency = 'USD';
    s = s.slice(0, s.length - code[0].length);
  }

  if (!GROUPED.test(s) && !PLAIN.test(s)) return null;
  if (!/[0-9]/.test(s)) return null;

  const repaired = s.replace(/[OolISB]/g, (c) => DIGIT_REPAIRS[c]);
  const [whole, cents] = repaired.replace(/,/g, '').split('.');
  return {
    value: `${whole.replace(/^0+(?=\d)/, '')}.${cents}`,
    sign,
    currency,
    corrected: repaired !== s,
  };
}

/**
 * Peels amounts off the end of a line of text, right to left, until the
 * remainder no longer ends in one. `amounts` is in reading order.
 *
 * "SOBEYS -$23.47 $1,200.00" -> label "SOBEYS", amounts [23.47, 1200.00]
 */
function extractAmounts(text) {
  const tokens = String(text ?? '').trim().split(/\s+/).filter(Boolean);
  const amounts = [];
  let end = tokens.length;
  outer: while (end > 0) {
    // Longest tail first, so "US$ -3.00" and "12.50 CR" stay together.
    for (let take = Math.min(3, end); take >= 1; take--) {
      const amount = parseAmount(tokens.slice(end - take, end).join(' '));
      if (amount) {
        amounts.unshift(amount);
        end -= take;
        continue outer;
      }
    }
    break;
  }
  return { amounts, label: tokens.slice(0, end).join(' ') };
}

/** The last amount on a line and the text before it, or null. */
function extractTrailingAmount(text) {
  const { amounts, label } = extractAmounts(text);
  if (amounts.length === 0) return null;
  const earlier = amounts.slice(0, -1).map((a) => a.value);
  return { amount: amounts[amounts.length - 1], label: [label, ...earlier].filter(Boolean).join(' ') };
}

/** '23.47' -> 2347. Amounts are at most 8 whole digits, well inside 2^53. */
function toCents(value) {
  return Number.parseInt(String(value).replace('.', ''), 10);
}

// ── Days ────────────────────────────────────────────────────────────────────

const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
const FULL_MONTHS = ['january', 'february', 'march', 'april', 'may', 'june', 'july', 'august',
  'september', 'october', 'november', 'december'];

const pad2 = (n) => String(n).padStart(2, '0');
const isLeap = (y) => (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
const daysInMonth = (y, m) => [31, isLeap(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1];

function makeDay(y, m, d) {
  if (!Number.isInteger(y) || m < 1 || m > 12 || d < 1 || d > daysInMonth(y, m)) return null;
  return `${y}-${pad2(m)}-${pad2(d)}`;
}

// Days since 1970-01-01 and back (Howard Hinnant's civil-date algorithms).
// Integer arithmetic, so no Date and no timezone is involved.
function daysFromCivil(y, m, d) {
  const yy = m <= 2 ? y - 1 : y;
  const era = Math.floor(yy / 400);
  const yoe = yy - era * 400;
  const doy = Math.floor((153 * (m + (m > 2 ? -3 : 9)) + 2) / 5) + d - 1;
  const doe = yoe * 365 + Math.floor(yoe / 4) - Math.floor(yoe / 100) + doy;
  return era * 146097 + doe - 719468;
}

function civilFromDays(days) {
  const z = days + 719468;
  const era = Math.floor(z / 146097);
  const doe = z - era * 146097;
  const yoe = Math.floor((doe - Math.floor(doe / 1460) + Math.floor(doe / 36524) - Math.floor(doe / 146096)) / 365);
  const doy = doe - (365 * yoe + Math.floor(yoe / 4) - Math.floor(yoe / 100));
  const mp = Math.floor((5 * doy + 2) / 153);
  const d = doy - Math.floor((153 * mp + 2) / 5) + 1;
  const m = mp + (mp < 10 ? 3 : -9);
  return { y: yoe + era * 400 + (m <= 2 ? 1 : 0), m, d };
}

function addDays(day, n) {
  const [y, m, d] = day.split('-').map(Number);
  const c = civilFromDays(daysFromCivil(y, m, d) + n);
  return makeDay(c.y, c.m, c.d);
}

function monthIndex(name) {
  const word = name.replace(/\.$/, '');
  const full = FULL_MONTHS.indexOf(word);
  if (full !== -1) return full + 1;
  if (word === 'sept') return 9;
  const short = word.length === 3 ? MONTHS.indexOf(word) : -1;
  return short === -1 ? null : short + 1;
}

const found = (day, inferredYear) => (day ? { day, inferredYear } : null);

/**
 * Reads a whole string as one day. `today` is the viewer's 'YYYY-MM-DD'; a day
 * with no year becomes the most recent such day not after it.
 *
 * @returns {{ day: string, inferredYear: boolean } | null}
 */
function parseDateDetail(text, today) {
  const s = String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    // OCR squeezes out spaces: "SEP15,2026" is "sep 15, 2026".
    .replace(/,(?=\d)/g, ', ')
    .replace(/^([a-z]{3,9}\.?)(?=\d)/, '$1 ')
    .replace(/^(\d{1,2})(?=[a-z]{3})/, '$1 ')
    .replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,? /, '');

  if (s === 'today') return found(today, false);
  if (s === 'yesterday') return found(addDays(today, -1), false);

  let m = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/.exec(s);
  if (m) return found(makeDay(+m[1], +m[2], +m[3]), false);

  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(s);
  if (m) {
    const a = +m[1];
    const b = +m[2];
    // 03/04/2026 could be either order; refuse rather than guess.
    if (a > 12 && b <= 12) return found(makeDay(+m[3], b, a), false);
    if (b > 12 && a <= 12) return found(makeDay(+m[3], a, b), false);
    if (a === b) return found(makeDay(+m[3], a, b), false);
    return null;
  }

  m = /^([a-z]+\.?) (\d{1,2})(?:st|nd|rd|th)?(?:,? (\d{4}))?$/.exec(s);
  if (m) return named(m[1], +m[2], m[3]);

  m = /^(\d{1,2}) ([a-z]+\.?)(?:,? (\d{4}))?$/.exec(s);
  if (m) return named(m[2], +m[1], m[3]);

  return null;

  function named(name, date, year) {
    const month = monthIndex(name);
    if (!month) return null;
    if (year) return found(makeDay(+year, month, date), false);
    const thisYear = Number(today.slice(0, 4));
    // Walks back so that Feb 29 lands on the most recent leap year.
    for (let y = thisYear; y >= thisYear - 8; y--) {
      const day = makeDay(y, month, date);
      if (day && day <= today) return found(day, true);
    }
    return null;
  }
}

function parseDate(text, today) {
  const detail = parseDateDetail(text, today);
  return detail ? detail.day : null;
}

/**
 * A day at the start of a label: "Sep 14 SOBEYS" -> day + "SOBEYS".
 * @returns {{ day: string, inferredYear: boolean, rest: string } | null}
 */
function splitLeadingDate(label, today) {
  const tokens = String(label ?? '').trim().split(/\s+/).filter(Boolean);
  for (let take = Math.min(4, tokens.length); take >= 1; take--) {
    const detail = parseDateDetail(tokens.slice(0, take).join(' '), today);
    if (detail) return { ...detail, rest: tokens.slice(take).join(' ') };
  }
  return null;
}

module.exports = {
  parseAmount,
  extractAmounts,
  extractTrailingAmount,
  toCents,
  parseDate,
  parseDateDetail,
  splitLeadingDate,
  addDays,
};
