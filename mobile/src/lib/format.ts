import type { Currency } from '../types/api';

/** An amount rendered in the viewer's locale, e.g. "$105.44". */
export function formatMoney(amount: number, currency: Currency = 'CAD'): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: 'currency',
      currency,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    // An unexpected currency code would otherwise throw inside a render.
    return `${amount.toFixed(2)} ${currency}`;
  }
}

/**
 * The amount to do arithmetic with.
 *
 * `transaction.amount` is a decimal string and `convertedAmount` is a number;
 * prefer the latter, fall back to parsing the former. Getting this wrong is
 * silent: `"105.44" * 2` is 210.88 but `"105.44" + 2` is `"105.442"`.
 */
export function amountOf(t: { amount: string; convertedAmount?: number }): number {
  if (typeof t.convertedAmount === 'number') return t.convertedAmount;
  const parsed = Number.parseFloat(t.amount);
  return Number.isFinite(parsed) ? parsed : 0;
}
