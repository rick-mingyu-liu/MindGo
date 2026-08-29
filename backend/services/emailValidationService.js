/**
 * Address validation for registration.
 *
 * MailboxLayer is the primary check; the hardcoded disposable-domain list is
 * the fallback. Before this existed the list was dead code and the API was
 * effectively mandatory: `validateEmailMailboxLayer` threw when the key was
 * absent, outside its own try, so the throw escaped to `register`'s catch and
 * **every** registration returned 500 — while `.env.example` and the startup
 * check both called the key optional. See IMPROVEMENTS.md item 13, decision C.
 *
 * The rule now: **a validator that cannot reach its service must not become a
 * gate.** Whenever MailboxLayer cannot give a usable answer — no key, network
 * error, HTTP error, an apilayer error payload, or a 200 whose shape we do not
 * recognise — this falls back to the domain list rather than failing the
 * request. Filtering degrades from "deliverability plus a large disposable
 * database" to "30 known disposable domains", which is weaker but is a real
 * check, and registration keeps working.
 *
 * That covers more than a missing key on purpose. An expired key, an exhausted
 * quota and an apilayer outage all used to produce the same thing the missing
 * key did — nobody can register — just by a different route: the old catch
 * returned `{ valid: false }`, so an outage rejected every address, and a
 * quota-exhausted response (200, `success: false`, no `format_valid`) was read
 * as "Invalid email format" and rejected too.
 */
const axios = require('axios');
const config = require('../config');
const { maskEmail } = require('../utils/privacy');

/**
 * Known disposable providers. Not close to exhaustive — that is the point of
 * paying MailboxLayer — but the well-known ones are most of the traffic.
 *
 * Was a 40-element array with 10 duplicates in it ('tmpmail.net' and three
 * neighbours appeared three times each). A Set, sorted, so a duplicate is
 * visible in a diff instead of silently absorbed.
 */
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com', '10minutemail.net', 'bccto.me', 'chacuo.net',
  'dispostable.com', 'fakeinbox.com', 'getairmail.com', 'getnada.com',
  'guerrillamail.com', 'maildrop.cc', 'mailinator.com', 'mailinator.net',
  'mailmetrash.com', 'mailnesia.com', 'mailnull.com', 'sharklasers.com',
  'spam.la', 'spam4.me', 'spamspot.com', 'temp-mail.org',
  'tempmail.org', 'tempmailaddress.com', 'tempr.email', 'throwaway.email',
  'tmpbox.net', 'tmpeml.com', 'tmpmail.net', 'tmpmail.org',
  'trashmail.com', 'yopmail.com',
]);

/**
 * Providers whose MX/SMTP probes MailboxLayer gets wrong often enough that
 * trusting them would reject real users. The Chinese hosts in particular
 * refuse the SMTP handshake from unknown probers.
 */
const MAJOR_DOMAINS = new Set([
  'gmail.com', 'outlook.com', 'hotmail.com', 'yahoo.com', 'icloud.com',
  '163.com', 'qq.com', 'sina.com', '126.com', '139.com', 'sohu.com',
]);

function domainOf(email) {
  if (typeof email !== 'string') return undefined;
  const at = email.lastIndexOf('@');
  return at < 0 ? undefined : email.slice(at + 1).toLowerCase();
}

/**
 * The fallback. Rejects a known disposable domain and accepts everything else.
 *
 * Deliberately does not check format — `routes/auth.js` already rejects
 * malformed addresses before the controller runs — and cannot check
 * deliverability, which is the part that needs a service.
 */
function validateAgainstDomainList(email) {
  const domain = domainOf(email);
  if (domain && DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return { valid: false, reason: 'Disposable email addresses are not allowed', source: 'domain-list' };
  }
  return { valid: true, source: 'domain-list' };
}

/**
 * True when the payload is one we can actually read a verdict out of.
 *
 * apilayer signals its own errors — bad key, exhausted quota — with HTTP 200
 * and `{ success: false, error: {...} }`, so a status check is not enough.
 * Requiring `format_valid` to be a boolean also catches shapes we have not
 * seen; the alternative is reading a missing field as `false` and telling a
 * user with a perfectly good address that it is malformed, which is what the
 * previous version did.
 */
function isUsableResponse(data) {
  return Boolean(data) && data.success !== false && typeof data.format_valid === 'boolean';
}

function interpretMailboxLayer(data, email) {
  if (!data.format_valid) {
    return { valid: false, reason: 'Invalid email format', source: 'mailboxlayer' };
  }
  if (data.disposable) {
    return { valid: false, reason: 'Disposable email addresses are not allowed', source: 'mailboxlayer' };
  }
  if ((!data.mx_found || !data.smtp_check) && MAJOR_DOMAINS.has(domainOf(email))) {
    return { valid: true, source: 'mailboxlayer' };
  }
  if (!data.mx_found) {
    return { valid: false, reason: 'Email domain cannot receive mail', source: 'mailboxlayer' };
  }
  if (!data.smtp_check) {
    return { valid: false, reason: 'Email address is not deliverable', source: 'mailboxlayer' };
  }
  return { valid: true, source: 'mailboxlayer' };
}

// Without a key every registration takes the fallback, and saying so on every
// one of them is noise. Say it once per process; a real API failure is an
// incident and still logs every time.
let warnedNoKey = false;

/**
 * Resolves to `{ valid, reason?, source }`. `source` says which check answered,
 * so a rejected registration can be explained from the log.
 *
 * Never throws: the caller is a request handler, and this used to be the one
 * thing in `register` that could fail before the try block it belonged in.
 */
async function validateEmail(email) {
  const apiKey = config.apiKeys.mailboxLayer;

  if (!apiKey) {
    if (!warnedNoKey) {
      warnedNoKey = true;
      console.warn('[EmailValidation] No MAILBOXLAYER_API_KEY; falling back to the disposable-domain list for the life of this process');
    }
    return validateAgainstDomainList(email);
  }

  const url = `https://apilayer.net/api/check?access_key=${apiKey}&email=${encodeURIComponent(email)}`;

  let data;
  try {
    ({ data } = await axios.get(url));
  } catch (error) {
    // console.error, not logger.error: this must print in production, where
    // it means registrations are being waved through on the weaker check.
    console.error('[EmailValidation] MailboxLayer request failed, falling back to the domain list:',
      error?.response?.status || error.code || error.message);
    return validateAgainstDomainList(email);
  }

  if (!isUsableResponse(data)) {
    console.error('[EmailValidation] MailboxLayer returned no usable verdict, falling back to the domain list:',
      data?.error?.info || data?.error?.type || 'unrecognised response shape');
    return validateAgainstDomainList(email);
  }

  // The full response carries the address back plus everything MailboxLayer
  // inferred about it. Log the verdict, which is what a failed registration
  // actually needs explaining.
  console.log('[EmailValidation] MailboxLayer checked', maskEmail(email), {
    format_valid: data.format_valid,
    disposable: data.disposable,
    mx_found: data.mx_found,
    smtp_check: data.smtp_check,
  });

  return interpretMailboxLayer(data, email);
}

module.exports = {
  validateEmail,
  validateAgainstDomainList,
  DISPOSABLE_EMAIL_DOMAINS,
  MAJOR_DOMAINS,
};
