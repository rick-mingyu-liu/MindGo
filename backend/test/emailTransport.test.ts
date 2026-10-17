import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import path from 'node:path';
import { transportOptions, fromAddress } from '../services/emailService';

/**
 * Which SMTP server the backend talks to, and what it says in From. No
 * network: only the option objects handed to nodemailer are inspected.
 */
describe('transportOptions', () => {
  test('without EMAIL_HOST it is Gmail, as before', () => {
    assert.deepEqual(transportOptions({ user: 'u@gmail.com', pass: 'p', port: 465 }), {
      service: 'gmail',
      auth: { user: 'u@gmail.com', pass: 'p' },
    });
  });

  test('with EMAIL_HOST it is that host, secure on 465', () => {
    assert.deepEqual(
      transportOptions({ host: 'smtp.resend.com', port: 465, user: 'resend', pass: 're_key' }),
      { host: 'smtp.resend.com', port: 465, secure: true, auth: { user: 'resend', pass: 're_key' } }
    );
  });

  test('another port is not secure (STARTTLS)', () => {
    const o = transportOptions({ host: 'smtp.example.com', port: 587, user: 'u', pass: 'p' });
    assert.equal(o.port, 587);
    assert.equal(o.secure, false);
  });
});

describe('fromAddress', () => {
  test('EMAIL_FROM is used verbatim, display name included', () => {
    assert.equal(
      fromAddress({ from: 'TermPocket <noreply@termpocket.com>', user: 'resend', port: 465 }),
      'TermPocket <noreply@termpocket.com>'
    );
  });

  test('without EMAIL_FROM it is the previous "TermPocket" <EMAIL_USER>', () => {
    assert.equal(fromAddress({ user: 'u@gmail.com', port: 465 }), '"TermPocket" <u@gmail.com>');
  });
});

// config reads the environment at import, so each case needs its own process.
describe('EMAIL_PORT parsing in config', () => {
  const portFor = (value: string): string =>
    execFileSync(process.execPath, ['-e', "console.log(require('./dist/config').email.port)"], {
      cwd: path.join(__dirname, '..', '..'),
      env: { ...process.env, EMAIL_PORT: value },
    }).toString().trim();

  test('unset, empty and invalid fall back to 465; a number is kept', () => {
    assert.equal(portFor(''), '465');
    assert.equal(portFor('abc'), '465');
    assert.equal(portFor('-1'), '465');
    assert.equal(portFor('587'), '587');
  });
});
