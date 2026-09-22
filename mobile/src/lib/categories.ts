/**
 * The transaction categories, copied from the exported `categories` object in
 * frontend/pages/transactions/new.tsx on 2026-09-22.
 *
 * This is a **third** copy and nothing pins it. The backend does not validate
 * a category against any list, and `GET /transactions/categories` returns only
 * the distinct values already present in your own rows, so it cannot serve as
 * a source of truth — for a brand-new account it returns an empty array.
 * backend/test/demoData.test.ts pins the seed's copy by parsing the frontend
 * file; no such guard exists for this one.
 *
 * Adding a category is now five edits, not four. The durable fix is to serve
 * the list from the backend so every client reads one source; see
 * docs/2026-09-22-mobile-client-design.md.
 */

export const categories = {
  income: [
    'Salary',
    'Freelance',
    'Investment Returns',
    'Business',
    'Tax Refund',
    'Other Income'
  ],
  expense: [
    'Groceries',
    'Dining Out',
    'Transportation',
    'Housing',
    'Utilities',
    'Entertainment',
    'Shopping',
    'Healthcare',
    'Education',
    'Travel',
    'Savings',
    'Other Expenses'
  ]
}

export type CategoryType = keyof typeof categories;
