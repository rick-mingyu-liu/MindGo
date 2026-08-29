/**
 * Calendar days, as the API sends them: 'YYYY-MM-DD'.
 *
 * A transaction date and a goal's target date are days, not instants. The
 * temptation is `new Date(value).toLocaleDateString()`, and it is wrong twice
 * over: a date-only string parses as UTC midnight per the spec, so every
 * viewer west of UTC reads the day before, and an ISO timestamp from the API
 * carries whatever offset the server happened to have.
 *
 * These helpers never build a Date from a day string in order to name it.
 * Where one is unavoidable — arithmetic — it is anchored at local noon, which
 * no DST shift can move across a date boundary.
 */

// A prefix match, so both '2026-08-28' and '2026-08-28T00:00:00.000Z' work.
// The API now sends the former; the latter is what it sent before the pg type
// parser landed, and what a stale deploy still sends.
const DAY = /^(\d{4})-(\d{2})-(\d{2})/

type DayInput = string | null | undefined

/** The 'YYYY-MM-DD' day of a value, or null if it does not carry one. */
export function toDay(value: DayInput): string | null {
  const match = DAY.exec(String(value ?? ''))
  return match ? match[0] : null
}

/** A day as a local Date at noon — safe to do arithmetic on, never to print. */
function atLocalNoon(day: string): Date {
  const [year, month, date] = day.split('-').map(Number)
  return new Date(year, month - 1, date, 12)
}

/** Today, in the viewer's own calendar. For date inputs and defaults. */
export function todayDay(now: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`
}

/** A day rendered for display in the viewer's locale. '' when there is none. */
export function formatDay(value: DayInput, locale?: string): string {
  const day = toDay(value)
  return day ? atLocalNoon(day).toLocaleDateString(locale) : ''
}

/**
 * A window as a reader expects to see one: its first and last *included* days.
 *
 * The API's windows are half-open — Spring 2026 is `2026-05-01` to
 * `2026-09-01`, and September 1st is not in it — which is right for a query
 * bound and wrong on a screen, where it reads as a term that runs into
 * September. So the end shown is the day before the bound.
 */
export function formatDayRange(
  start: DayInput,
  endExclusive: DayInput,
  locale?: string,
): string {
  const from = toDay(start)
  const to = toDay(endExclusive)
  if (!from || !to) return ''
  const lastIncluded = atLocalNoon(to)
  lastIncluded.setDate(lastIncluded.getDate() - 1)
  return `${formatDay(from, locale)} – ${lastIncluded.toLocaleDateString(locale)}`
}

/**
 * Whole days from today until `value`; negative once it has passed, null when
 * there is no date. Both ends sit at local noon, so the result is a count of
 * calendar days and not a rounded count of elapsed hours.
 */
export function daysUntil(value: DayInput, now: Date = new Date()): number | null {
  const day = toDay(value)
  if (!day) return null
  const today = atLocalNoon(todayDay(now))
  return Math.round((atLocalNoon(day).getTime() - today.getTime()) / 86_400_000)
}
