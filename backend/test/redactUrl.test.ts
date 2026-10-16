import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { redactUrl, REDACTED } from '../utils/redactUrl';

/**
 * Unit tests for the request-log URL redaction (utils/redactUrl.ts).
 *
 * Every token-bearing form found in the codebase: the API's
 * /auth/verify-email/<token> path, the frontend's /verify-email?token=<token>
 * page (which arrives as the Referer), and a personal access token pasted into
 * a URL. Plus the URLs that must come through untouched, because a log that
 * redacts everything has stopped being a log.
 */

const TOKEN = 'a'.repeat(32) + 'f00dfeed'.repeat(4); // 64 hex chars, like crypto.randomBytes(32)
const PAT = 'mgo_FAKEfakeFAKEfake_-0123456789';

describe('redactUrl: token-bearing URLs', () => {
  const cases: Array<[string, string]> = [
    [`/auth/verify-email/${TOKEN}`, `/auth/verify-email/${REDACTED}`],
    [`/auth/verify-email/${TOKEN}/`, `/auth/verify-email/${REDACTED}/`],
    [`/auth/verify-email/${TOKEN}?lang=zh`, `/auth/verify-email/${REDACTED}?lang=zh`],
    [`/auth/verify-email/${TOKEN}#x`, `/auth/verify-email/${REDACTED}#x`],
    // Express routes case-insensitively, so this reaches the same handler.
    [`/AUTH/Verify-Email/${TOKEN}`, `/AUTH/Verify-Email/${REDACTED}`],
    [`/verify-email?token=${TOKEN}`, `/verify-email?token=${REDACTED}`],
    [`/zh/verify-email?token=${TOKEN}`, `/zh/verify-email?token=${REDACTED}`],
    [`https://mind-go.vercel.app/verify-email?token=${TOKEN}`, `https://mind-go.vercel.app/verify-email?token=${REDACTED}`],
    [`https://termpocket-api.onrender.com/auth/verify-email/${TOKEN}`, `https://termpocket-api.onrender.com/auth/verify-email/${REDACTED}`],
    [`/verify-email?lang=en&token=${TOKEN}&x=1`, `/verify-email?lang=en&token=${REDACTED}&x=1`],
    [`/verify-email?TOKEN=${TOKEN}`, `/verify-email?TOKEN=${REDACTED}`],
    [`/verify-email?tok%65n=${TOKEN}`, `/verify-email?tok%65n=${REDACTED}`],
    [`/verify-email?token[]=${TOKEN}`, `/verify-email?token[]=${REDACTED}`],
    [`/verify-email?token%5B0%5D=${TOKEN}`, `/verify-email?token%5B0%5D=${REDACTED}`],
    [`/verify-email?token=${TOKEN}&token=${TOKEN}`, `/verify-email?token=${REDACTED}&token=${REDACTED}`],
    [`/verify-email#token=${TOKEN}`, `/verify-email#token=${REDACTED}`],
    [`/x?access_token=${TOKEN}&api_key=${TOKEN}&password=hunter2`, `/x?access_token=${REDACTED}&api_key=${REDACTED}&password=${REDACTED}`],
    [`/mcp?t=${PAT}`, `/mcp?t=${REDACTED}`],
    [`/anything/${PAT}/more`, `/anything/${REDACTED}/more`],
  ];
  for (const [input, expected] of cases) {
    test(input.replace(TOKEN, '<token>').replace(PAT, '<pat>'), () => {
      const out = redactUrl(input);
      assert.equal(out, expected);
      assert.ok(!out?.includes(TOKEN) && !out?.includes(PAT), 'a secret survived');
    });
  }
});

describe('redactUrl: URLs with no credential are unchanged', () => {
  const unchanged = [
    '/',
    '/health',
    '/transactions?page=2&limit=50',
    '/transactions?before=MjAyNi0wOC0yOHw0Mg',
    '/summary/rolling?term=2026-spring&targetCurrency=CAD',
    '/auth/verify-email',
    '/auth/profile',
    '/agent/conversations/3f1c6a8e-0000-4000-8000-000000000000/messages',
    'https://mind-go.vercel.app/dashboard?tab=goals',
    '/search?q=token',
    '/x?tokens=1&mytoken=2',
    '/x?flag&a=',
    '',
  ];
  for (const url of unchanged) {
    test(url || '(empty)', () => assert.equal(redactUrl(url), url));
  }
});

describe('redactUrl: never throws', () => {
  test('non-strings give undefined, which morgan prints as -', () => {
    for (const v of [undefined, null, 42, {}, ['/auth/verify-email/x']]) assert.equal(redactUrl(v), undefined);
  });

  test('a malformed escape in a parameter name is judged as written', () => {
    assert.equal(redactUrl(`/x?%E0%A4%A=1&token=${TOKEN}`), `/x?%E0%A4%A=1&token=${REDACTED}`);
  });
});
