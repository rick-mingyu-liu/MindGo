const { test, describe, beforeEach, afterEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');
const config = require('../config');
const {
  validateEmail,
  validateAgainstDomainList,
  DISPOSABLE_EMAIL_DOMAINS,
} = require('../services/emailValidationService');

/**
 * Decision C: registration must work without MAILBOXLAYER_API_KEY.
 *
 * The bug these guard against was not "the check is skipped" — it was the
 * opposite. `validateEmailMailboxLayer` threw when the key was missing, from
 * outside its own try, so the throw escaped to `register`'s catch and every
 * single registration returned 500. Three other paths reached the same place:
 * an outage (the old catch returned `{ valid: false }`), an expired key and an
 * exhausted quota (200 with `success: false` and no `format_valid`, read as
 * "Invalid email format").
 *
 * So the property under test is: **whenever MailboxLayer cannot answer,
 * validation degrades to the domain list — it never becomes a gate.**
 */

const NO_KEY = undefined;
const KEY = 'test-key-the-http-call-is-mocked';

describe('email validation', () => {
  let savedKey;
  let printed;

  beforeEach(() => {
    savedKey = config.apiKeys.mailboxLayer;
    printed = [];
    mock.method(console, 'log', (...a) => printed.push(a));
    mock.method(console, 'warn', (...a) => printed.push(a));
    mock.method(console, 'error', (...a) => printed.push(a));
  });

  afterEach(() => {
    config.apiKeys.mailboxLayer = savedKey;
    mock.restoreAll();
  });

  describe('the domain-list fallback itself', () => {
    test('rejects a known disposable domain', () => {
      const result = validateAgainstDomainList('someone@mailinator.com');
      assert.equal(result.valid, false);
      assert.equal(result.reason, 'Disposable email addresses are not allowed');
      assert.equal(result.source, 'domain-list');
    });

    test('accepts an ordinary address', () => {
      assert.deepEqual(
        validateAgainstDomainList('john.doe@example.com'),
        { valid: true, source: 'domain-list' }
      );
    });

    test('matches the domain case-insensitively', () => {
      // normalizeEmail() in routes/auth.js lowercases today, so this is
      // defence against that changing rather than a live path.
      assert.equal(validateAgainstDomainList('a@MailInator.COM').valid, false);
    });

    test('splits on the last @, so a quoted local part cannot smuggle a domain', () => {
      assert.equal(validateAgainstDomainList('"x@example.com"@mailinator.com').valid, false);
      assert.equal(validateAgainstDomainList('"x@mailinator.com"@example.com').valid, true);
    });

    test('does not throw on junk', () => {
      for (const junk of [undefined, null, 42, {}, '', 'no-at-sign']) {
        assert.equal(validateAgainstDomainList(junk).valid, true, `threw or rejected on ${JSON.stringify(junk)}`);
      }
    });

    test('the list has no duplicates and is not empty', () => {
      // It was a 40-element array holding 30 distinct domains. A Set makes a
      // repeat visible in review instead of absorbing it.
      assert.ok(DISPOSABLE_EMAIL_DOMAINS instanceof Set);
      assert.equal(DISPOSABLE_EMAIL_DOMAINS.size, 30);
    });
  });

  describe('with no API key', () => {
    beforeEach(() => { config.apiKeys.mailboxLayer = NO_KEY; });

    test('does not throw — this is the 500 that decision C is about', async () => {
      await assert.doesNotReject(() => validateEmail('john.doe@example.com'));
    });

    test('accepts an ordinary address via the domain list', async () => {
      const result = await validateEmail('john.doe@example.com');
      assert.deepEqual(result, { valid: true, source: 'domain-list' });
    });

    test('still rejects a disposable address', async () => {
      // The point of falling back rather than skipping: some filtering remains.
      const result = await validateEmail('someone@guerrillamail.com');
      assert.equal(result.valid, false);
      assert.equal(result.source, 'domain-list');
    });

    test('makes no HTTP request at all', async () => {
      const get = mock.method(axios, 'get', async () => {
        throw new Error('axios.get must not be called without a key');
      });
      await validateEmail('john.doe@example.com');
      assert.equal(get.mock.callCount(), 0);
    });
  });

  describe('with an API key, when MailboxLayer answers', () => {
    beforeEach(() => { config.apiKeys.mailboxLayer = KEY; });

    const ok = { format_valid: true, disposable: false, mx_found: true, smtp_check: true };
    const reply = (over) => mock.method(axios, 'get', async () => ({ data: { ...ok, ...over } }));

    test('accepts a clean verdict', async () => {
      reply({});
      assert.deepEqual(await validateEmail('john.doe@example.com'), { valid: true, source: 'mailboxlayer' });
    });

    test('rejects what MailboxLayer calls disposable, even off the list', async () => {
      reply({ disposable: true });
      const result = await validateEmail('someone@some-new-burner.example');
      assert.equal(result.valid, false);
      assert.equal(result.source, 'mailboxlayer');
    });

    test('rejects an undeliverable domain', async () => {
      reply({ mx_found: false });
      assert.equal((await validateEmail('a@nowhere.example')).reason, 'Email domain cannot receive mail');
    });

    test('rejects an undeliverable mailbox', async () => {
      reply({ smtp_check: false });
      assert.equal((await validateEmail('a@nowhere.example')).reason, 'Email address is not deliverable');
    });

    test('waives MX and SMTP for major providers', async () => {
      // qq.com and friends refuse the SMTP handshake from unknown probers, so
      // trusting the probe would reject real users.
      reply({ mx_found: false, smtp_check: false });
      assert.equal((await validateEmail('a@qq.com')).valid, true);
      assert.equal((await validateEmail('a@gmail.com')).valid, true);
      assert.equal((await validateEmail('a@not-major.example')).valid, false);
    });

    test('does not log the raw address', async () => {
      reply({});
      await validateEmail('john.doe@example.com');
      const output = printed.map((a) => a.map(String).join(' ')).join('\n');
      assert.ok(!output.includes('john.doe@example.com'), 'raw address reached the log');
      assert.match(output, /j\*\*\*@example\.com/);
    });

    test('does not put the API key in the log', async () => {
      reply({});
      await validateEmail('john.doe@example.com');
      const output = printed.map((a) => a.map(String).join(' ')).join('\n');
      assert.ok(!output.includes(KEY), 'the API key reached the log');
    });
  });

  describe('with an API key, when MailboxLayer cannot answer', () => {
    beforeEach(() => { config.apiKeys.mailboxLayer = KEY; });

    test('falls back when the request throws', async () => {
      mock.method(axios, 'get', async () => { throw Object.assign(new Error('socket hang up'), { code: 'ECONNRESET' }); });
      assert.deepEqual(await validateEmail('john.doe@example.com'), { valid: true, source: 'domain-list' });
    });

    test('falls back on an HTTP error', async () => {
      mock.method(axios, 'get', async () => { throw Object.assign(new Error('Request failed'), { response: { status: 503 } }); });
      assert.equal((await validateEmail('john.doe@example.com')).source, 'domain-list');
    });

    test('falls back on an apilayer error payload rather than calling the address malformed', async () => {
      // apilayer signals a bad key or an exhausted quota with HTTP 200 and
      // `success: false`. The old code read the missing `format_valid` as
      // false and told the user their address was invalid — a wrong answer,
      // not a missing one, which is why a status check is not enough here.
      mock.method(axios, 'get', async () => ({
        data: { success: false, error: { code: 101, type: 'invalid_access_key', info: 'You have not supplied a valid API Access Key.' } },
      }));
      const result = await validateEmail('john.doe@example.com');
      assert.equal(result.valid, true);
      assert.equal(result.source, 'domain-list');
      assert.notEqual(result.reason, 'Invalid email format');
    });

    test('falls back on a response shape it does not recognise', async () => {
      for (const data of [undefined, null, {}, { format_valid: 'yes' }, 'not json at all']) {
        mock.method(axios, 'get', async () => ({ data }));
        const result = await validateEmail('john.doe@example.com');
        assert.equal(result.source, 'domain-list', `shape ${JSON.stringify(data)} was not treated as unusable`);
      }
    });

    test('a disposable address is still rejected while the service is down', async () => {
      // The fallback has to be a real check, not a waiver.
      mock.method(axios, 'get', async () => { throw new Error('down'); });
      assert.equal((await validateEmail('someone@yopmail.com')).valid, false);
    });

    test('says in the log that it fell back, and why', async () => {
      // This must be visible in production: registrations are being waved
      // through on the weaker check, and nothing else would say so.
      mock.method(axios, 'get', async () => { throw Object.assign(new Error('nope'), { code: 'ENOTFOUND' }); });
      await validateEmail('john.doe@example.com');
      const output = printed.map((a) => a.map(String).join(' ')).join('\n');
      assert.match(output, /fall(ing)? back to the domain list/i);
      assert.match(output, /ENOTFOUND/);
    });
  });
});
