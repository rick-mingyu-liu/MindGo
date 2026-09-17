const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { errorSummary } = require('../utils/errorSummary');

/**
 * The one shape a caught error may take in a log line: its name and its code.
 * Never its message — a pg error's message can quote the row that failed, and
 * the import routes must not log screenshot text or row values.
 */
describe('errorSummary', () => {
  test('keeps the name and code of an Error', () => {
    const error = Object.assign(new Error('value "Tim Hortons 4.50" is too long'), { code: '22001' });
    assert.deepEqual(errorSummary(error), { error: 'Error', code: '22001' });
  });

  test('keeps the subclass name, and an undefined code as undefined', () => {
    const summary = errorSummary(new TypeError('x'));
    assert.deepEqual(summary, { error: 'TypeError', code: undefined });
    assert.ok('code' in summary);
  });

  test('never includes the message', () => {
    const summary = errorSummary(Object.assign(new Error('secret row'), { code: 'X' }));
    assert.ok(!JSON.stringify(summary).includes('secret row'));
  });

  test('describes a thrown non-Error by its type', () => {
    assert.deepEqual(errorSummary('boom'), { error: 'string', code: undefined });
    assert.deepEqual(errorSummary(null), { error: 'null', code: undefined });
    assert.deepEqual(errorSummary({ code: 'ECONNRESET' }), { error: 'object', code: 'ECONNRESET' });
  });

  test('ignores a code that is not a string', () => {
    assert.deepEqual(errorSummary(Object.assign(new Error('x'), { code: 42 })), { error: 'Error', code: undefined });
  });
});
