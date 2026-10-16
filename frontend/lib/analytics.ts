import type { BeforeSendEvent } from '@vercel/analytics/react'

/**
 * Vercel Web Analytics `beforeSend`: report every event's URL without its
 * query string or fragment.
 *
 * The email verification link is `/verify-email?token=…`, and the token in
 * it is a credential. Stripping the query on every event, rather than only on
 * that page, keeps any future token- or id-bearing query out of analytics too;
 * no report here needs one.
 */
export function stripUrlQuery(event: BeforeSendEvent): BeforeSendEvent {
  const { url } = event
  let cleaned: string
  try {
    const parsed = new URL(url)
    parsed.search = ''
    parsed.hash = ''
    cleaned = parsed.toString()
  } catch {
    // Not an absolute URL: cut at the first '?' or '#' by hand.
    cleaned = url.split(/[?#]/, 1)[0] ?? ''
  }
  return { ...event, url: cleaned }
}
