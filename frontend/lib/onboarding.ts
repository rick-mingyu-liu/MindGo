/**
 * Whether the first-run tour has been seen, per account.
 *
 * Completion or a skip is remembered in localStorage under the user's id, so
 * each account sees the tour once per browser. Storage may be missing or throw
 * (private windows, blocked site data); then the in-memory set still keeps the
 * tour to at most once per page session.
 */
const PREFIX = 'onboardingTour:'
const seenThisSession = new Set<string>()

function storageKey(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}') as { id?: number }
    return `${PREFIX}${user.id ?? 'unknown'}`
  } catch {
    return `${PREFIX}unknown`
  }
}

export function tourSeen(): boolean {
  const key = storageKey()
  if (seenThisSession.has(key)) return true
  try {
    return localStorage.getItem(key) !== null
  } catch {
    return false
  }
}

/** Called when the tour opens on its own, so a remount cannot open it twice. */
export function markTourShown() {
  seenThisSession.add(storageKey())
}

/** Called when the tour closes for any reason: finished, skipped or dismissed. */
export function markTourSeen() {
  const key = storageKey()
  seenThisSession.add(key)
  try {
    localStorage.setItem(key, 'done')
  } catch {
    // Remembered for this page session only.
  }
}
