/**
 * Shared vocabulary for the screenshot import parser: what OCR hands in, what
 * `groupRows` turns it into, and what a parsed draft transaction looks like.
 *
 * Mirrors three sources that already agree: the JSDoc in
 * `services/import/*.js`, `frontend/lib/ocr/types.ts` (`OcrLine`), and
 * `frontend/lib/import/review.ts` (`DraftFlag`, `DraftRow`, `ParseResponse`).
 * Amounts stay two-decimal strings everywhere here, never numbers, exactly as
 * the parser produces them today.
 */

/** An OCR text box's position and size, in the original image's pixels. */
export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One piece of recognised text, as the browser's OCR sends it. */
export interface OcrLine {
  text: string;
  conf: number;
  box: Box;
}

/**
 * One visual row of a screenshot, as `groupRows` (services/import/rows.js)
 * builds it from lines whose boxes overlap. `lines` is reading order: top
 * line first, then left to right within a line.
 */
export interface Row {
  text: string;
  conf: number;
  box: Box;
  height: number;
  lines: OcrLine[];
}

export type Layout = 'bank-list' | 'receipt' | 'uber-activity' | 'uber-eats-orders' | 'wechat-pay' | 'unknown';

export type TransactionType = 'income' | 'expense';

/** Why a draft row needs a second look, or where it came from. */
export type DraftFlag =
  | 'arithmetic_verified'
  | 'arithmetic_failed'
  | 'balance_mismatch'
  | 'corrected_chars'
  | 'low_confidence'
  | 'missing_date'
  | 'type_guessed'
  | 'pending'
  | 'possible_duplicate';

/** Where a draft row's values came from: the rule-based parser, or the LLM fallback (not yet built). */
export type DraftSource = 'parser' | 'llm';

/** A row as `parseOcr` (services/import/parse.js) returns it in `ParseResult.rows`. */
export interface Draft {
  date: string | null;
  amount: string;
  currency: string;
  description: string;
  category: string | null;
  type: TransactionType;
  confidence: number;
  flags: DraftFlag[];
  source: DraftSource;
  boxes: Box[];
}

/** What `parseOcr` returns, and what `POST /import/parse` sends back. */
export interface ParseResult {
  layout: Layout;
  layoutConfidence: number;
  rows: Draft[];
  warnings: string[];
  unparsedLines: string[];
  needsFallback: boolean;
}
