import { AgentError, type ConversationSettings, type DraftRow } from './types';
export const currencies = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY'];
export const categories = {
  income: ['Salary', 'Freelance', 'Investment Returns', 'Business', 'Tax Refund', 'Other Income'],
  expense: ['Groceries', 'Dining Out', 'Transportation', 'Housing', 'Utilities', 'Entertainment', 'Shopping', 'Healthcare', 'Education', 'Travel', 'Savings', 'Other Expenses'],
};
function invalid(): never { throw new AgentError('agent_invalid_input'); }
export function validateUuid(value: unknown): string {
  if (typeof value !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) invalid();
  return value.toLowerCase();
}
export function validateSettings(value: unknown): ConversationSettings {
  if (!value || typeof value !== 'object') invalid();
  const { currency, timezone, language } = value as Record<string, unknown>;
  if (typeof currency !== 'string' || !currencies.includes(currency) || typeof timezone !== 'string' || timezone.length > 100 || typeof language !== 'string' || !['auto', 'en', 'zh'].includes(language)) invalid();
  try { new Intl.DateTimeFormat('en', { timeZone: timezone }); } catch { invalid(); }
  return { currency, timezone, language: language as ConversationSettings['language'] };
}
export function validateMessage(value: unknown): string {
  if (typeof value !== 'string' || !value.trim() || value.length > 4000 || value.includes('\0')) invalid();
  return value.trim();
}
export function validateRows(value: unknown, allowEmpty = false): DraftRow[] {
  if (!Array.isArray(value) || value.length > 12 || (!allowEmpty && value.length === 0)) invalid();
  const ids = new Set<string>();
  return value.map((item: unknown) => {
    if (!item || typeof item !== 'object') invalid();
    const row = item as Record<string, unknown>;
    const id = validateUuid(row.id);
    if (ids.has(id)) invalid(); ids.add(id);
    const { amount, description, category, type, date, currency } = row;
    if (typeof amount !== 'string' || !/^(0|[1-9]\d{0,7})\.\d{2}$/.test(amount) || amount === '0.00') invalid();
    if (typeof description !== 'string' || !description.trim() || description.length > 255 || description.includes('\0')) invalid();
    if ((type !== 'expense' && type !== 'income') || typeof category !== 'string' || !categories[type].includes(category)) invalid();
    if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date) || date < '1900-01-01' || date > '2100-12-31') invalid();
    const day = new Date(`${date}T00:00:00.000Z`); if (!Number.isFinite(day.getTime()) || day.toISOString().slice(0, 10) !== date) invalid();
    if (typeof currency !== 'string' || !currencies.includes(currency)) invalid();
    return { id, amount, description: description.trim(), category, type, date, currency };
  });
}
export const validateDraftRows = validateRows;
