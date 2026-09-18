import { extractAmounts, parseDateDetail, toCents } from './tokens';
import type { DateDetail } from './tokens';
import type { OcrLine, ParserDraft, Row } from '../../types/import';

/**
 * Uber's Activity screen: one card per trip, stacked top to bottom as
 *
 *   The Toronto Clinic            <- destination, may wrap onto a second line
 *   Sep 16 • 6:14 p.m.   Rebook   <- date and time, beside a button
 *   $10.38                        <- the fare, alone on its line
 *
 * A trip is a date-and-time line with a lone fare tucked under it; its
 * destination is the run of text lines tucked above it. "Tucked" is a gap of
 * under half the smaller line's height: measured 0.02–0.34 inside a card, and
 * over 1.0 from the map's street names above the first card (2026-09-17).
 * Buttons are dropped first, so a Rebook beside a line changes nothing.
 *
 * Every trip is a charge, so — as with a receipt — the direction comes from
 * the layout and is not a guess. The category is Transportation whatever the
 * destination says: "The Toronto Clinic" is a ride, not a doctor's bill.
 * Uber Eats orders live on their own screen; see uberEats.ts.
 */
const BUTTON = /^[^\p{L}\p{N}]*(rate|rebook|help|details|receipt)$/iu;
const HAS_WORD = /[\p{L}\p{N}]/u;
const DATE_TIME = /^(.+?)\s*[•·]\s*\d{1,2}:\d{2}\s*[ap]\s*\.?\s*m\b/i;
const TUCKED = 0.5;

/** A card's vertical extent and its tightest line height, for tuck checks. */
interface Bounds {
  y: number;
  height: number;
  lineHeight: number;
}

/** One run of non-button lines on a card, joined into text with its bounds. */
interface Item {
  lines: OcrLine[];
  text: string;
  box: Bounds;
}

/** "Sep 16 • 7:16 p.m." -> the day; anything without a time -> null. */
export function splitDateTime(text: unknown, today: string): DateDetail | null {
  const match = DATE_TIME.exec(String(text ?? '').trim());
  return match ? parseDateDetail(match[1], today) : null;
}

export function parseUberActivity(rows: Row[], today: string): { drafts: ParserDraft[] } {
  const items: Item[] = rows
    .map((row) => row.lines.filter((l) => HAS_WORD.test(l.text) && !BUTTON.test(l.text.trim())))
    .filter((lines) => lines.length > 0)
    .map((lines) => ({ lines, text: lines.map((l) => l.text).join(' '), box: boundsOf(lines) }));

  const drafts: ParserDraft[] = [];
  items.forEach((item, i) => {
    const when = splitDateTime(item.text, today);
    const fareItem = items[i + 1];
    if (!when || !fareItem || !isTucked(fareItem.box, item.box)) return;
    const { amounts, label } = extractAmounts(fareItem.text);
    if (amounts.length !== 1 || label) return;
    const fare = amounts[0];
    if (!fare) return;
    if (toCents(fare.value) === 0) return;

    const title: Item[] = [];
    for (let j = i - 1; j >= 0; j--) {
      const candidate = items[j];
      if (!candidate) break; // j is in range by construction; this only satisfies the type checker
      const anchor = title[0] ?? item;
      if (!isTucked(anchor.box, candidate.box)) break;
      if (splitDateTime(candidate.text, today) || extractAmounts(candidate.text).amounts.length) break;
      title.unshift(candidate);
    }
    const titleLines = title.flatMap((t) => t.lines);
    const destination = title.map((t) => t.text).join(' ');
    const dateConf = Math.min(...item.lines.map((l) => l.conf));

    drafts.push({
      date: when.day,
      amount: fare.value,
      currency: fare.currency || 'CAD',
      description: destination ? `Uber: ${destination}` : 'Uber',
      category: 'Transportation',
      type: 'expense',
      flags: fare.corrected ? ['corrected_chars'] : [],
      conf: {
        amount: Math.min(...fareItem.lines.map((l) => l.conf)) * (fare.corrected ? 0.8 : 1),
        date: dateConf * (when.inferredYear ? 0.9 : 1),
        description: titleLines.length ? Math.min(...titleLines.map((l) => l.conf)) : 0,
        type: 1,
      },
      boxes: [...titleLines, ...item.lines, ...fareItem.lines].map((l) => l.box),
    });
  });
  return { drafts };
}

function boundsOf(lines: OcrLine[]): Bounds {
  const top = Math.min(...lines.map((l) => l.box.y));
  const bottom = Math.max(...lines.map((l) => l.box.y + l.box.height));
  return { y: top, height: bottom - top, lineHeight: Math.min(...lines.map((l) => l.box.height)) };
}

/** `lower` starts just under where `upper` ends. */
function isTucked(lower: Bounds, upper: Bounds): boolean {
  const gap = lower.y - (upper.y + upper.height);
  const height = Math.min(lower.lineHeight, upper.lineHeight);
  return gap > -TUCKED * height && gap < TUCKED * height;
}
