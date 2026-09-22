/**
 * The shapes the API actually returns, captured from the live service on
 * 2026-09-22 rather than inferred from the controllers.
 *
 * Two details here are easy to get wrong and expensive to debug:
 *
 *   - `amount` is a **string**, not a number. Postgres `NUMERIC` arrives
 *     through `pg` as a string so no precision is lost on the way, and the
 *     backend passes it straight through. `amount * 2` silently produces a
 *     string-coerced result and `amount.toFixed()` throws. Use
 *     `convertedAmount`, which is a real number, or parse deliberately.
 *
 *   - `date` is a plain day, `'2026-09-21'`, never a timestamp. The backend
 *     registers a `pg` type parser specifically so this is true. Do not build
 *     a Date from it to display it — see lib/date.ts.
 */

export type TransactionType = 'income' | 'expense';

export type Currency = 'CAD' | 'USD' | 'EUR' | 'GBP' | 'AUD' | 'CNY';

export const CURRENCIES: Currency[] = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY'];

export interface User {
  id: number;
  email: string;
  first_name: string;
  last_name: string;
}

export interface LoginResponse {
  message: string;
  user: User;
  token: string;
}

export interface Transaction {
  id: number;
  user_id: number;
  /** A decimal string, e.g. "105.44". Not a number. */
  amount: string;
  description: string;
  category: string;
  type: TransactionType;
  /** 'YYYY-MM-DD'. */
  date: string;
  created_at: string;
  updated_at: string;
  currency: Currency;
  source: 'manual' | 'ocr' | 'ocr_llm';
  /** Converted into the account's display currency. A real number. */
  convertedAmount: number;
  convertedCurrency: Currency;
}

export interface Pagination {
  page: number;
  limit: number;
  total: number;
  pages: number;
}

export interface TransactionsResponse {
  transactions: Transaction[];
  pagination: Pagination;
}

export interface CategoryTotal {
  total: number;
  count: number;
  average: number;
}

/**
 * `GET /summary/rolling?term=current`.
 *
 * Note how much of this the server computes: `periodLabel`, `termLabel`,
 * `startDate` and `endDate` all arrive ready to display. That is deliberate —
 * it is what stops a second client reimplementing the Waterloo term calendar
 * slightly differently from the first. Render these; never derive them.
 *
 * `endDate` is **exclusive**. Fall 2026 ends `2027-01-01`, which is not a day
 * in the term. `formatDayRange` in lib/date.ts handles that.
 */
/** One month's totals, as `monthlyBreakdown` carries them. */
export interface MonthTotals {
  /** 'YYYY-MM'. */
  month: string;
  income: number;
  expenses: number;
  netIncome: number;
  transactions: Transaction[];
}

export interface SummaryResponse {
  period: string;
  term: string | null;
  year: number | null;
  periodLabel: string;
  termLabel: string | null;
  startDate: string;
  /** Exclusive. */
  endDate: string;
  totalIncome: number;
  totalExpenses: number;
  netIncome: number;
  monthlyBreakdown: MonthTotals[];
  categories: Record<string, CategoryTotal>;
  transactions: Transaction[];
  targetCurrency: Currency;
}

export interface NewTransaction {
  amount: number;
  description: string;
  category: string;
  type: TransactionType;
  date: string;
  currency: Currency;
}
