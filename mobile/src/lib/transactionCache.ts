import type { Transaction } from '../types/api';

/**
 * Rows the list has already fetched, so the detail screen can open instantly.
 *
 * This exists because the API has no `GET /transactions/:id`. It has
 * `PUT /:id` and `DELETE /:id`, but the only way to *read* one row is to
 * page through `GET /transactions` until it appears — 64 pages, for the demo
 * account. So the list hands the row forward instead.
 *
 * A module-level Map rather than route params: the row would otherwise be
 * JSON-encoded into a URL, and an id is a much better thing to put in one.
 *
 * The consequence to know about is that it is empty on a cold start, so a
 * deep link straight to a transaction has nothing to show. The detail screen
 * says so rather than rendering an empty form. Adding `GET /transactions/:id`
 * to the backend would remove the whole problem — note that it must be
 * declared *after* `GET /categories` in routes/transactions.ts, or `:id`
 * swallows that route.
 */
const rows = new Map<number, Transaction>();

export function remember(items: Transaction[]): void {
  for (const item of items) rows.set(item.id, item);
}

export function recall(id: number): Transaction | undefined {
  return rows.get(id);
}

export function forget(id: number): void {
  rows.delete(id);
}
