/**
 * Strips credentials out of a URL before it reaches a request log.
 *
 * morgan's `combined` format prints the full request URL and the full Referer
 * header. Email verification is `GET /auth/verify-email/<token>`, and the page
 * that calls it is the frontend's `/verify-email?token=<token>`, so with the
 * stock format every verification token was written to Render's logs: once in
 * the request line, and again in the Referer whenever the browser sent the
 * page's full URL (same-origin deploys, or a looser Referrer-Policy).
 *
 * Two rules, both applied to the path-plus-query of a relative URL or of an
 * absolute one (the Referer):
 *
 * - **Path**: the segment after `verify-email/` becomes `[redacted]`. Express
 *   matches routes case-insensitively, so this does too.
 * - **Query and fragment**: the value of any parameter whose name is in
 *   `SECRET_PARAMS` (case-insensitive, with qs's `name[]` / `name[0]` array
 *   suffixes ignored) becomes `[redacted]`.
 *
 * And, wherever it appears, anything shaped like a personal access token
 * (`mgo_…`) is redacted: those travel in the Authorization header today, but a
 * client that pastes one into a URL should not get it logged.
 *
 * Everything else — the rest of the path, other parameters, their order — is
 * left exactly as it was, so the log keeps its diagnostic value.
 *
 * Never throws: it runs inside the request logger, and a logging helper that
 * can throw turns a diagnostic line into an outage.
 */

export const REDACTED = '[redacted]';

const SECRET_PARAMS = new Set([
  'token',
  'access_token',
  'refresh_token',
  'id_token',
  'verification_token',
  'reset_token',
  'api_key',
  'apikey',
  'key',
  'secret',
  'password',
  'code',
  'signature',
  'sig',
  'auth',
]);

// The segment after verify-email/, up to the next /, ?, # or the end.
const TOKEN_PATH = /(\/verify-email\/)[^/?#]*/gi;
// Personal access tokens (services/accessTokens.ts): mgo_ plus base64url.
const ACCESS_TOKEN = /mgo_[A-Za-z0-9_-]+/g;

function paramName(raw: string): string {
  let name = raw;
  try {
    name = decodeURIComponent(raw.replace(/\+/g, ' '));
  } catch {
    // A malformed escape: judge the name as written.
  }
  return name.trim().toLowerCase().replace(/\[[^\]]*\]$/, '');
}

function redactParams(params: string): string {
  return params
    .split('&')
    .map((pair) => {
      const eq = pair.indexOf('=');
      if (eq === -1) return pair;
      return SECRET_PARAMS.has(paramName(pair.slice(0, eq))) ? `${pair.slice(0, eq)}=${REDACTED}` : pair;
    })
    .join('&');
}

export function redactUrl(url: unknown): string | undefined {
  if (typeof url !== 'string') return undefined;
  try {
    const hashAt = url.indexOf('#');
    const beforeHash = hashAt === -1 ? url : url.slice(0, hashAt);
    const fragment = hashAt === -1 ? null : url.slice(hashAt + 1);
    const queryAt = beforeHash.indexOf('?');
    const path = queryAt === -1 ? beforeHash : beforeHash.slice(0, queryAt);
    const search = queryAt === -1 ? null : beforeHash.slice(queryAt + 1);

    let out = path.replace(TOKEN_PATH, `$1${REDACTED}`);
    if (search !== null) out += `?${redactParams(search)}`;
    if (fragment !== null) out += `#${redactParams(fragment)}`;
    return out.replace(ACCESS_TOKEN, REDACTED);
  } catch {
    return REDACTED;
  }
}
