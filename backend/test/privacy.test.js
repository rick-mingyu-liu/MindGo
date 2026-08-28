const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { maskEmail } = require('../utils/privacy');

/**
 * Unit tests for the log-masking helper.
 *
 * Two things matter here and they pull in opposite directions: the output must
 * not identify a person, and the function must never throw. It is called from
 * inside logging statements, so an exception here converts a diagnostic line
 * into a 500 on the route that was trying to explain itself.
 */

describe('maskEmail', () => {
  test('keeps the first character and the domain', () => {
    assert.equal(maskEmail('john.doe@example.com'), 'j***@example.com');
  });

  test('hides the local part beyond the first character', () => {
    assert.doesNotMatch(maskEmail('john.doe@example.com'), /ohn\.doe/);
  });

  test('does not leak the local part length', () => {
    // One star per hidden character would distinguish 'j@x.com' from
    // 'jonathan@x.com' — a weak identifier, but a free one to remove.
    assert.equal(
      maskEmail('a@example.com').split('@')[0],
      maskEmail('averylonglocalpart@example.com').split('@')[0]
    );
  });

  test('splits on the last @, not the first', () => {
    // Quoted local parts may legally contain @.
    assert.equal(maskEmail('"weird@local"@example.com'), '"***@example.com');
  });

  test('keeps subdomains intact', () => {
    assert.equal(maskEmail('a@mail.corp.example.co.uk'), 'a***@mail.corp.example.co.uk');
  });

  describe('never throws, whatever it is handed', () => {
    // Each of these reaches it only through a bug elsewhere, which is exactly
    // when the log line matters most.
    const junk = [
      [undefined, '<no address>'],
      [null, '<no address>'],
      ['', '<no address>'],
      [42, '<no address>'],
      [{}, '<no address>'],
      [[], '<no address>'],
      ['no-at-sign', '<malformed address>'],
      ['@example.com', '<malformed address>'],   // nothing before the @
      ['user@', '<malformed address>'],          // nothing after it
      ['@', '<malformed address>'],
    ];

    for (const [input, expected] of junk) {
      test(`${JSON.stringify(input)} -> ${expected}`, () => {
        assert.equal(maskEmail(input), expected);
      });
    }
  });

  test('never returns anything containing the full input address', () => {
    for (const address of [
      'john.doe@example.com',
      'a@b.co',
      'first.last+tag@sub.domain.example.org',
    ]) {
      assert.ok(
        !maskEmail(address).includes(address),
        `masked form still contained ${address}`
      );
    }
  });
});
