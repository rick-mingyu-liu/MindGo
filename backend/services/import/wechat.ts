import { parseAmount, makeDay } from './tokens';
import type { DateDetail, ParsedAmount } from './tokens';
import type { DraftFlag, OcrLine, ParserDraft, Row, TransactionType } from '../../types/import';

/**
 * WeChat Pay's Transactions list:
 *
 *   2026/9        Expenditures¥485.00  Incomes¥485.00   <- month header
 *   [avatar]  微信红包-来自张三                  +120.00    <- description, amount
 *             9/13 20:23                                <- date and time
 *
 * A transaction is a row holding an amount, with a date-and-time line under
 * its description (a gap of under one line height, left edges aligned —
 * measured 0.4–0.63 of the smaller line, over 1.5 to the next description).
 * The year is the nearest month header's above it; with none above, the most
 * recent such day, flagged as inferred.
 *
 * Amounts carry no symbol but are always yuan: the wallet holds nothing else,
 * and the headers print ¥. They always have two decimals, so one stray
 * character after them — "+150.00.", "+4.801", measured 2026-09-17 — is noise
 * the model added, dropped and flagged `corrected_chars`.
 *
 * WeChat prints + for money in and − for money out, and nothing for moves
 * between the user's own balances ("零钱通转出-到零钱"). An unsigned amount is
 * a guess from its words, as on a bank list.
 */
const AMOUNT = /^([+\-−–]?)\s*(\d{1,3}(?:,\d{3})+|\d+)\.(\d{2})([.。]|\d)?$/;
const STAMP = /^(\d{1,2})\/(\d{1,2})[\s.·]+\d{1,2}:\d{2}$/;
const MONTH_HEADER = /^(\d{4})\s*[/.年-]\s*(\d{1,2})\s*月?$/;
const INCOME_WORDS = /来自|收款|退款|到零钱|收入|received|refund/i;
const HAS_WORD = /[\p{L}\p{N}]/u;

/** A month header's year and its vertical position. */
interface MonthHeader {
  year: number;
  y: number;
}

/** "+4.801" -> 4.80, repaired; anything that is not a lone amount -> null. */
export function readWechatAmount(text: unknown): ParsedAmount | null {
  const match = AMOUNT.exec(String(text ?? '').trim());
  if (!match) return null;
  const amount = parseAmount(`${match[1]}${match[2]}.${match[3]}`);
  return amount && { ...amount, corrected: amount.corrected || Boolean(match[4]) };
}

export const isStamp = (text: unknown): boolean => STAMP.test(String(text ?? '').trim());
export const isMonthHeader = (text: unknown): boolean => MONTH_HEADER.test(String(text ?? '').trim());

export function parseWechatPay(rows: Row[], today: string): { drafts: ParserDraft[] } {
  const lines = rows.flatMap((row) => row.lines);
  const stamps = lines.filter((l) => isStamp(l.text));
  const headers: MonthHeader[] = lines
    .filter((l) => isMonthHeader(l.text))
    // isMonthHeader(l.text) already proved this line matches MONTH_HEADER, so
    // the re-exec below always succeeds; `match?.[1]` is just for the type.
    .map((l) => ({ year: Number(MONTH_HEADER.exec(l.text.trim())?.[1]), y: l.box.y }));

  const drafts: ParserDraft[] = [];
  for (const row of rows) {
    const amountLine = [...row.lines].reverse().find((l) => readWechatAmount(l.text));
    if (!amountLine) continue;
    // A tall amount box can pull the date line onto this row; it is still a date.
    const words = row.lines.filter((l) => l !== amountLine && l.box.x < amountLine.box.x
      && HAS_WORD.test(l.text) && !isStamp(l.text));
    if (words.length === 0) continue;

    const bottom = Math.max(...words.map((l) => l.box.y + l.box.height));
    const stamp = stamps
      .filter((s) => words.some((w) => inColumn(s, w)) && isJustBelow(s, bottom, words))
      .sort((a, b) => a.box.y - b.box.y)[0];
    if (!stamp) continue;
    const description = words.filter((w) => inColumn(stamp, w));
    if (description.length === 0) continue;

    // stamp is drawn from `stamps`, already filtered by isStamp, so this
    // re-exec always matches.
    const stampMatch = STAMP.exec(stamp.text.trim());
    if (!stampMatch) continue;
    const [, monthText, dateText] = stampMatch;
    const month = Number(monthText);
    const date = Number(dateText);
    const header = headers.filter((h) => h.y < stamp.box.y).pop();
    const day = header ? { day: makeDay(header.year, month, date), inferredYear: false } : mostRecent(month, date, today);
    if (!day || !day.day) continue;

    const amount = readWechatAmount(amountLine.text);
    if (!amount) continue; // amountLine was chosen because this was already truthy
    const label = description.map((l) => l.text).join(' ');
    const flags: DraftFlag[] = [];
    let type: TransactionType;
    if (amount.sign === 1) type = 'income';
    else if (amount.sign === -1) type = 'expense';
    else {
      type = INCOME_WORDS.test(label) ? 'income' : 'expense';
      flags.push('type_guessed');
    }
    if (amount.corrected) flags.push('corrected_chars');

    drafts.push({
      date: day.day,
      amount: amount.value,
      currency: 'CNY',
      description: label,
      type,
      flags,
      conf: {
        amount: amountLine.conf * (amount.corrected ? 0.8 : 1),
        date: stamp.conf * (day.inferredYear ? 0.9 : 1),
        description: Math.min(...description.map((l) => l.conf)),
        type: flags.includes('type_guessed') ? 0.9 : 1,
      },
      boxes: [...description, amountLine, stamp].map((l) => l.box),
    });
  }
  return { drafts };
}

function mostRecent(month: number, date: number, today: string): DateDetail | null {
  const thisYear = Number(today.slice(0, 4));
  for (let year = thisYear; year >= thisYear - 8; year--) {
    const day = makeDay(year, month, date);
    if (day && day <= today) return { day, inferredYear: true };
  }
  return null;
}

/** Left edges within a line's height of each other. */
const inColumn = (a: OcrLine, b: OcrLine): boolean => Math.abs(a.box.x - b.box.x) < Math.max(a.box.height, b.box.height);

/** `stamp` starts under `bottom`, less than one description line lower. */
function isJustBelow(stamp: OcrLine, bottom: number, words: OcrLine[]): boolean {
  const gap = stamp.box.y - bottom;
  const height = Math.max(...words.map((w) => w.box.height));
  return gap > -0.5 * stamp.box.height && gap < height;
}
