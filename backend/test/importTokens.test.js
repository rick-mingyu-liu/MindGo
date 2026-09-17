const { test, describe, after } = require('node:test');
const assert = require('node:assert/strict');
const {
  parseAmount, extractAmounts, extractTrailingAmount, toCents,
  parseDate, parseDateDetail, splitLeadingDate, addDays,
} = require('../services/import/tokens');

/**
 * The amount and day readers are where a misread becomes a wrong number in
 * someone's books, so every accepted format is pinned here — and so is every
 * format that must be *rejected*, because a reader that guesses is worse than
 * one that gives up and lets the user type.
 */

describe('parseAmount', () => {
  for (const [input, value, sign] of [
    ['23.47', '23.47', null],
    ['$23.47', '23.47', null],
    ['$1,234.56', '1234.56', null],
    ['-$23.47', '23.47', -1],
    ['$-23.47', '23.47', -1],
    ['−23.47', '23.47', -1], // U+2212 minus
    ['+$1,250.00', '1250.00', 1],
    ['(12.50)', '12.50', -1],
    ['12.50 CR', '12.50', 1],
    ['0.07', '0.07', null],
    ['007.50', '7.50', null],
  ]) {
    test(`reads ${input}`, () => {
      const amount = parseAmount(input);
      assert.equal(amount.value, value);
      assert.equal(amount.sign, sign);
      assert.equal(amount.corrected, false);
    });
  }

  test('marks US dollars', () => {
    assert.equal(parseAmount('US$ 3.00').currency, 'USD');
    assert.equal(parseAmount('3.00 USD').currency, 'USD');
    assert.equal(parseAmount('$3.00').currency, null);
  });

  for (const input of ['1 234,56', '12,50', '1,234,56', '23', '$23', '23.4', '23.456', 'Sep 14',
    'TOTAL', '', '1,23.45', 'IOS.OO']) {
    test(`rejects ${JSON.stringify(input)}`, () => {
      assert.equal(parseAmount(input), null);
    });
  }

  test('repairs letters inside an amount and says so', () => {
    const amount = parseAmount('$1O.5O');
    assert.equal(amount.value, '10.50');
    assert.equal(amount.corrected, true);
    assert.equal(parseAmount('l2.3S').value, '12.35');
  });
});

describe('extractAmounts', () => {
  test('peels a transaction amount and a balance off a row', () => {
    const { amounts, label } = extractAmounts('SOBEYS #1234 -$23.47 $1,200.00');
    assert.equal(label, 'SOBEYS #1234');
    assert.deepEqual(amounts.map((a) => a.value), ['23.47', '1200.00']);
    assert.equal(amounts[0].sign, -1);
  });

  test('keeps a separated sign with its amount', () => {
    const { amounts, label } = extractAmounts('Refund - $ 12.50');
    assert.equal(label, 'Refund');
    assert.equal(amounts[0].sign, -1);
  });

  test('does not treat a word as part of an amount', () => {
    assert.equal(extractTrailingAmount('TOTAL 0.07').label, 'TOTAL');
    assert.equal(extractTrailingAmount('HST 13% 0.85').label, 'HST 13%');
    assert.equal(extractTrailingAmount('no amount here'), null);
  });
});

test('toCents', () => {
  assert.equal(toCents('23.47'), 2347);
  assert.equal(toCents('0.07'), 7);
  assert.equal(toCents('99999999.99'), 9999999999);
});

describe('parseDate', () => {
  const TODAY = '2026-09-16';
  for (const [input, day] of [
    ['2026-09-14', '2026-09-14'],
    ['2026/09/14', '2026-09-14'],
    ['Sep 14', '2026-09-14'],
    ['SEPT. 14', '2026-09-14'],
    ['September 14, 2025', '2025-09-14'],
    ['Mon, Sep 14', '2026-09-14'],
    ['14 Sep', '2026-09-14'],
    ['Dec 24', '2025-12-24'], // no year and after today: last year
    ['Sep 16', '2026-09-16'], // today itself is not "after today"
    ['Sep 17', '2025-09-17'],
    ['09/14/2026', '2026-09-14'],
    ['14/09/2026', '2026-09-14'],
    ['07/07/2026', '2026-07-07'],
    ['Today', '2026-09-16'],
    ['Yesterday', '2026-09-15'],
    // OCR squeezes out spaces (measured 2026-09-17).
    ['SEP 16,2026', '2026-09-16'],
    ['SEP15,2026', '2026-09-15'],
    ['14SEP', '2026-09-14'],
  ]) {
    test(`reads ${input}`, () => assert.equal(parseDate(input, TODAY), day));
  }

  for (const input of ['03/04/2026', 'Sep 31', '2026-02-30', 'Total 14', '14', 'Sep', '12.35', '']) {
    test(`rejects ${JSON.stringify(input)}`, () => assert.equal(parseDate(input, TODAY), null));
  }

  test('says when the year was inferred', () => {
    assert.equal(parseDateDetail('Sep 14', TODAY).inferredYear, true);
    assert.equal(parseDateDetail('2026-09-14', TODAY).inferredYear, false);
  });

  test('Feb 29 with no year lands on the most recent leap year', () => {
    assert.equal(parseDate('Feb 29', '2026-09-16'), '2024-02-29');
    assert.equal(parseDate('Feb 29', '2028-03-01'), '2028-02-29');
  });

  test('yesterday crosses month and year boundaries', () => {
    assert.equal(parseDate('Yesterday', '2026-03-01'), '2026-02-28');
    assert.equal(parseDate('Yesterday', '2028-03-01'), '2028-02-29');
    assert.equal(parseDate('Yesterday', '2027-01-01'), '2026-12-31');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  });

  test('splitLeadingDate', () => {
    assert.deepEqual(splitLeadingDate('Sep 14 SOBEYS #1234', TODAY),
      { day: '2026-09-14', inferredYear: true, rest: 'SOBEYS #1234' });
    assert.equal(splitLeadingDate('SOBEYS Sep 14', TODAY), null);
  });

  // The server's timezone must not change any answer: nothing above builds a
  // Date. Swept in-process, as terms.test.js does.
  describe('the same answers in every timezone', () => {
    const saved = process.env.TZ;
    after(() => { process.env.TZ = saved; });
    for (const tz of ['UTC', 'America/Vancouver', 'Asia/Shanghai', 'Pacific/Kiritimati']) {
      test(tz, () => {
        process.env.TZ = tz;
        assert.equal(parseDate('Sep 14', TODAY), '2026-09-14');
        assert.equal(parseDate('Yesterday', '2026-03-01'), '2026-02-28');
        assert.equal(parseDate('Dec 31', '2027-01-01'), '2026-12-31');
      });
    }
  });
});
