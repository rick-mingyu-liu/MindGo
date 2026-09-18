import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { groupRows } from '../services/import/rows';
import { parseReceipt } from '../services/import/receipt';
import { TODAY, line, at, receiptPhoto, RECEIPT_IMAGE } from './helpers/ocrLayouts';

/**
 * Paper receipts: one transaction, whose amount must be the total and not any
 * of the other numbers printed around it.
 */
describe('parseReceipt', () => {
  test('reads the total, merchant and date, and checks the arithmetic', () => {
    const [draft] = parseReceipt(receiptPhoto(), RECEIPT_IMAGE, TODAY).drafts;
    assert.equal(draft!.amount, '7.67');
    assert.equal(draft!.description, 'SOBEYS');
    assert.equal(draft!.date, '2026-09-14');
    assert.equal(draft!.type, 'expense');
    assert.deepEqual(draft!.flags, ['arithmetic_verified']);
  });

  test('arithmetic that does not add up is flagged', () => {
    const rows = receiptPhoto();
    const total = rows.find((r) => r.text.startsWith('TOTAL'));
    total!.text = 'TOTAL 7.87';
    const [draft] = parseReceipt(rows, RECEIPT_IMAGE, TODAY).drafts;
    assert.ok(draft!.flags.includes('arithmetic_failed'));
  });

  test('includes a tip printed between subtotal and total', () => {
    const [draft] = parseReceipt(groupRows([
      line('CAFE PYRENEES', { y: 0, height: 60 }),
      line('Sep 14', { y: at(1) }),
      line('SUBTOTAL 10.00', { y: at(2) }),
      line('HST 1.30', { y: at(3) }),
      line('TIP 2.00', { y: at(4) }),
      line('TOTAL 13.30', { y: at(5) }),
    ]), { width: 0, height: 400 }, TODAY).drafts;
    assert.equal(draft!.amount, '13.30');
    assert.deepEqual(draft!.flags, ['arithmetic_verified']);
  });

  test('never takes the subtotal, a tax total or savings as the amount', () => {
    const [draft] = parseReceipt(groupRows([
      line('SHOP', { y: 0, height: 60 }),
      line('SUBTOTAL 50.00', { y: at(1) }),
      line('TOTAL TAX 6.50', { y: at(2) }),
      line('TOTAL SAVINGS 9.99', { y: at(3) }),
      line('AMOUNT DUE 56.50', { y: at(4) }),
    ]), { width: 0, height: 400 }, TODAY).drafts;
    assert.equal(draft!.amount, '56.50');
    assert.ok(draft!.flags.includes('arithmetic_verified'));
    assert.ok(draft!.flags.includes('missing_date'));
  });

  test('the lower of two TOTAL lines wins', () => {
    const [draft] = parseReceipt(groupRows([
      line('TOTAL 10.00', { y: at(1) }),
      line('TOTAL 12.00', { y: at(2) }),
    ]), { width: 0, height: 400 }, TODAY).drafts;
    assert.equal(draft!.amount, '12.00');
  });

  test('the merchant is not the phone number or the address', () => {
    const [draft] = parseReceipt(groupRows([
      line('(519) 555-0100', { y: 0, height: 80 }),
      line('450 Columbia St W', { y: at(1), height: 80 }),
      line('Farm Boy', { y: at(2), height: 50 }),
      line('TOTAL 3.00', { y: at(3) }),
    ]), { width: 0, height: 1000 }, TODAY).drafts;
    assert.equal(draft!.description, 'Farm Boy');
  });

  test('no total means no transaction', () => {
    assert.deepEqual(parseReceipt(groupRows([line('THANK YOU')]), { width: 0, height: 100 }, TODAY).drafts, []);
  });
});
