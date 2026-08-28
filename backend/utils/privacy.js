/**
 * Helpers for keeping user data out of the logs.
 *
 * Three leaks have been found in this codebase so far: `/auth/verify-email`
 * returning a stranger's address in its response, the unverified-account
 * cleanup writing deleted users' addresses to the log every ten minutes, and
 * registration logging raw verification tokens. The first two are fixed; this
 * module exists so the third fix does not have to choose between "log nothing"
 * and "log the address".
 *
 * The rule the callers follow: **log a user id where one exists, and a masked
 * address only where it does not** — before the INSERT, or when the lookup
 * failed and there is no id to name.
 */

/**
 * Reduces an address to its first character and its domain: a masked form that
 * still answers the questions a log is usually asked — which provider, was it
 * a corporate domain, is this the same user as the line above — without
 * printing something that identifies a person.
 *
 * Deliberately keeps the domain. It is the part that carries the diagnostic
 * value (MX failures, provider-specific bounces), and it is not by itself
 * identifying for the mail hosts nearly everyone uses. For a rare domain it is
 * a weaker guarantee, which is why an id is preferred whenever one exists.
 *
 * Never throws: it is called from logging, and a logging helper that can throw
 * turns a diagnostic line into an outage.
 */
function maskEmail(email) {
  if (typeof email !== 'string' || email.length === 0) return '<no address>';

  const at = email.lastIndexOf('@');
  // No '@', or nothing before it — not an address; say so rather than guess.
  if (at < 1) return '<malformed address>';

  const local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (domain.length === 0) return '<malformed address>';

  // One star per hidden character would leak the local part's length, which is
  // a small distinguisher on its own. Fixed width instead.
  return `${local[0]}***@${domain}`;
}

module.exports = { maskEmail };
