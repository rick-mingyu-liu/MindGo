import { extractAmounts, parseDateDetail, toCents } from './tokens';
import type { DateDetail, ParsedAmount } from './tokens';
import { categorize } from './categorize';
import type { OcrLine, ParserDraft, Row } from '../../types/import';

/**
 * Uber Eats' Past orders tab: one order per store, stacked as
 *
 *   [logo]  Shoppers Drug Mart            <- store
 *           Mar 15 • $60.54 • 1 item      <- date, total paid, item count
 *           Ankle Brace, Medium ...       <- the first items   [View store]
 *
 * An order is its date-total-count line. Its store is the text tucked above
 * that line in the same column — the logo on the left is read as text too
 * ("SHOPPERS", "LCBO") and shares rows with these lines, which is why this
 * works on lines, not rows. "Tucked" is a gap of under half the smaller
 * line's height: measured 0.19–0.28 from a store to its order line, and over
 * 1.5 from the previous order's last item (2026-09-17).
 *
 * The total is what was charged, fees and tip included; the Past items tab
 * shows today's menu prices instead and is deliberately not recognised. Every
 * order is a charge, so the direction is not a guess. The category comes from
 * the store alone ("Uber Eats" would make every order Dining Out, groceries
 * and pharmacy included) and stays empty when the store is unknown.
 */
const ORDER_LINE = /^(.+?)\s*[•·]\s*(.+?)\s*[•·]\s*\d+\s*i\s*t\s*e\s*m\s*s?$/i;
const TUCKED = 0.5;

/** An order's date and its single total amount. */
type OrderLine = DateDetail & { amount: ParsedAmount };

/** "Mar 15 • $60.54 • 1 item" -> the day and the amount; anything else -> null. */
export function splitOrderLine(text: unknown, today: string): OrderLine | null {
  const match = ORDER_LINE.exec(String(text ?? '').trim().replace(/\s+/g, ' '));
  if (!match) return null;
  const date = parseDateDetail(match[1], today);
  const { amounts, label } = extractAmounts(match[2]);
  if (!date || amounts.length !== 1 || label) return null;
  const amount = amounts[0];
  if (!amount) return null;
  return { ...date, amount };
}

export function parseUberEatsOrders(rows: Row[], today: string): { drafts: ParserDraft[] } {
  const lines = rows.flatMap((row) => row.lines);
  const drafts: ParserDraft[] = [];

  for (const line of lines) {
    const order = splitOrderLine(line.text, today);
    if (!order || toCents(order.amount.value) === 0) continue;

    const store: OcrLine[] = [];
    let below = line;
    for (;;) {
      const above = lines
        .filter((l) => inColumn(l, line) && isTucked(below, l) && !splitOrderLine(l.text, today))
        .sort((a, b) => b.box.y - a.box.y)[0];
      if (!above || store.includes(above)) break;
      store.unshift(above);
      below = above;
    }
    const name = store.map((l) => l.text).join(' ');

    drafts.push({
      date: order.day,
      amount: order.amount.value,
      currency: order.amount.currency || 'CAD',
      description: name ? `Uber Eats: ${name}` : 'Uber Eats',
      category: name ? categorize(name, 'expense') : null,
      type: 'expense',
      flags: order.amount.corrected ? ['corrected_chars'] : [],
      conf: {
        amount: line.conf * (order.amount.corrected ? 0.8 : 1),
        date: line.conf * (order.inferredYear ? 0.9 : 1),
        description: store.length ? Math.min(...store.map((l) => l.conf)) : 0,
        type: 1,
      },
      boxes: [...store, line].map((l) => l.box),
    });
  }
  return { drafts };
}

/** Left edges within a line's height of each other. */
const inColumn = (a: OcrLine, b: OcrLine): boolean => Math.abs(a.box.x - b.box.x) < Math.min(a.box.height, b.box.height);

/** `upper` ends just above where `lower` starts. */
function isTucked(lower: OcrLine, upper: OcrLine): boolean {
  const gap = lower.box.y - (upper.box.y + upper.box.height);
  const height = Math.min(lower.box.height, upper.box.height);
  return gap > -TUCKED * height && gap < TUCKED * height;
}
