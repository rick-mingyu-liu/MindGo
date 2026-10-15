import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { packageRoot } from '../utils/packageRoot';
import { validateRows, validateSettings, categories } from '../services/agent/validation';
const row = () => ({ id: randomUUID(), amount: '12.50', description: 'Lunch', category: 'Dining Out', type: 'expense', date: '2026-10-14', currency: 'CAD' });
test('agent drafts reject ambiguous money, invalid calendar dates, categories and duplicate IDs', () => {
  assert.equal(validateRows([row()])[0]?.amount, '12.50');
  for (const amount of [12.5, '1e2', '-1.00', '0.00', '1.001', '100000000.00']) assert.throws(() => validateRows([{ ...row(), amount }]));
  for (const date of ['2026-02-29', '2026-13-01', '2026-1-01']) assert.throws(() => validateRows([{ ...row(), date }]));
  assert.throws(() => validateRows([{ ...row(), category: 'Salary' }]));
  const duplicate = row(); assert.throws(() => validateRows([duplicate, duplicate]));
  assert.throws(() => validateRows([{ ...row(), currency: 'XYZ' }]));
  assert.throws(() => validateRows(Array.from({length:13},row)));
  assert.equal(validateRows(Array.from({length:12},row)).length,12);
});
test('conversation assumptions require explicit supported currency, language and valid timezone', () => {
  assert.deepEqual(validateSettings({ currency: 'CAD', timezone: 'America/Toronto', language: 'auto' }), { currency: 'CAD', timezone: 'America/Toronto', language: 'auto' });
  assert.throws(() => validateSettings({ currency: 'CAD', timezone: 'Invalid/Zone', language: 'en' }));
  assert.throws(() => validateSettings({ currency: 'CAD', timezone: 'UTC', language: ['en'] }));
});

test('agent canonical categories match the manual transaction picker', () => {
  const picker=readFileSync(path.join(packageRoot(__dirname),'../frontend/pages/transactions/new.tsx'),'utf8');
  for(const type of ['income','expense'] as const) {
    const list=picker.match(new RegExp(`${type}:\\s*\\[([\\s\\S]*?)\\]`))?.[1];
    assert.ok(list);assert.deepEqual([...list.matchAll(/'([^']+)'/g)].map(match=>match[1]),categories[type]);
  }
});
