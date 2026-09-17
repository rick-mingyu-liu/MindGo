const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const { groupRows } = require('../services/import/rows');
const { classifyLayout } = require('../services/import/classify');
const { categorize, KEYWORDS } = require('../services/import/categorize');
const { CATEGORIES } = require('../db/demoData');
const { TODAY, line, bankScreenshot, receiptPhoto } = require('./helpers/ocrLayouts');

/**
 * Which parser a screenshot goes to, and the first-guess category of each row.
 */
describe('classifyLayout', () => {
  test('a bank list', () => {
    const result = classifyLayout(bankScreenshot(), TODAY);
    assert.equal(result.layout, 'bank-list');
    assert.ok(result.confidence >= 0.6, `confidence ${result.confidence}`);
  });

  test('a receipt', () => {
    const result = classifyLayout(receiptPhoto(), TODAY);
    assert.equal(result.layout, 'receipt');
    assert.ok(result.confidence >= 0.6, `confidence ${result.confidence}`);
  });

  test('text with no signals is unknown', () => {
    assert.deepEqual(classifyLayout(groupRows([line('hello world')]), TODAY),
      { layout: 'unknown', confidence: 0 });
  });
});

describe('categorize', () => {
  test('guesses from the merchant, longest keyword first', () => {
    assert.equal(categorize('SOBEYS #1234', 'expense'), 'Groceries');
    assert.equal(categorize('UBER EATS *ORDER', 'expense'), 'Dining Out');
    assert.equal(categorize('UBER *TRIP', 'expense'), 'Transportation');
    assert.equal(categorize("McDonald's #40", 'expense'), 'Dining Out');
    assert.equal(categorize('PAYROLL DEPOSIT', 'income'), 'Salary');
  });

  test('answers only within the transaction type, and only when sure', () => {
    assert.equal(categorize('PAYROLL DEPOSIT', 'expense'), null);
    assert.equal(categorize('Some Local Shop', 'expense'), null);
    assert.equal(categorize('', 'expense'), null);
    // "interest" in "INTERESTING" is not a match.
    assert.equal(categorize('INTERESTING BOOKS', 'income'), null);
  });

  test('every category it can answer is one the picker offers', () => {
    for (const [type, map] of Object.entries(KEYWORDS)) {
      for (const category of Object.keys(map)) {
        assert.ok(CATEGORIES[type].includes(category), `${category} is not a ${type} category`);
      }
    }
  });
});
