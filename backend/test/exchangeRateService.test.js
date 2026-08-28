const { test, describe, beforeEach, mock } = require('node:test');
const assert = require('node:assert/strict');
const axios = require('axios');

/**
 * Unit tests for currency conversion.
 *
 * This is the highest-value thing to test in the codebase: it is arithmetic on
 * money, it sits behind a network call and a one-hour cache, and a wrong rate
 * does not throw — it produces a plausible-looking number. A summary that is
 * quietly 1.37x too large is the kind of bug you find in a bank statement
 * rather than in a stack trace.
 *
 * No network: axios.get is mocked. No database.
 */

// The service holds module-level cache state, so each test re-requires it from
// a clean module registry rather than sharing a warm cache.
function freshService() {
  delete require.cache[require.resolve('../services/exchangeRateService')];
  return require('../services/exchangeRateService');
}

function respondWith(rates) {
  return mock.method(axios, 'get', async () => ({ data: { rates } }));
}

describe('getExchangeRate', () => {
  beforeEach(() => mock.restoreAll());

  test('returns the rate the API reports', async () => {
    respondWith({ CAD: 1.37 });
    const { getExchangeRate } = freshService();

    assert.equal(await getExchangeRate('USD', 'CAD'), 1.37);
  });

  test('asks the API for the right currency pair', async () => {
    const get = respondWith({ CAD: 1.37 });
    const { getExchangeRate } = freshService();

    await getExchangeRate('USD', 'CAD');

    const url = get.mock.calls[0].arguments[0];
    assert.match(url, /base=USD/);
    assert.match(url, /symbols=CAD/);
  });

  test('caches, so a repeated pair does not hit the network again', async () => {
    const get = respondWith({ CAD: 1.37 });
    const { getExchangeRate } = freshService();

    await getExchangeRate('USD', 'CAD');
    await getExchangeRate('USD', 'CAD');
    await getExchangeRate('USD', 'CAD');

    assert.equal(get.mock.callCount(), 1);
  });

  test('caches per direction — USD→CAD must not answer for CAD→USD', async () => {
    // The cache key is `${from}_${to}`. If it were ever reduced to an unordered
    // pair, every converted amount in the app would be inverted, and still look
    // like money.
    const get = mock.method(axios, 'get', async (url) => ({
      data: { rates: url.includes('base=USD') ? { CAD: 1.37 } : { USD: 0.73 } },
    }));
    const { getExchangeRate } = freshService();

    assert.equal(await getExchangeRate('USD', 'CAD'), 1.37);
    assert.equal(await getExchangeRate('CAD', 'USD'), 0.73);
    assert.equal(get.mock.callCount(), 2);
  });

  test('throws when the response has no rate for the target currency', async () => {
    respondWith({ EUR: 0.92 }); // asked for CAD, got EUR
    const { getExchangeRate } = freshService();

    await assert.rejects(
      () => getExchangeRate('USD', 'CAD'),
      /Failed to fetch exchange rate/
    );
  });

  test('throws rather than returning a string that would silently become NaN', async () => {
    // `"1.37" * amount` happens to work; `"abc" * amount` is NaN, and NaN
    // propagates through every total in the summary without an error.
    respondWith({ CAD: '1.37' });
    const { getExchangeRate } = freshService();

    await assert.rejects(() => getExchangeRate('USD', 'CAD'));
  });

  test('does not cache a failure', async () => {
    let call = 0;
    const get = mock.method(axios, 'get', async () => {
      call += 1;
      return call === 1 ? { data: {} } : { data: { rates: { CAD: 1.37 } } };
    });
    const { getExchangeRate } = freshService();

    await assert.rejects(() => getExchangeRate('USD', 'CAD'));
    assert.equal(await getExchangeRate('USD', 'CAD'), 1.37);
    assert.equal(get.mock.callCount(), 2);
  });
});
