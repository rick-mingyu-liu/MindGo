/**
 * The screenshot import's review state, as plain functions: what a draft row
 * looks like on screen, when it may be imported, and what gets sent.
 *
 * Amounts stay two-decimal strings throughout, as the parser returns them and
 * as POST /transactions/import requires them — never floats.
 */
import type { OcrLine } from '@/lib/ocr/types'

export type TransactionType = 'income' | 'expense'

export type DraftFlag =
  | 'arithmetic_verified'
  | 'arithmetic_failed'
  | 'balance_mismatch'
  | 'corrected_chars'
  | 'low_confidence'
  | 'missing_date'
  | 'type_guessed'
  | 'pending'
  | 'possible_duplicate'

/** A row as POST /import/parse returns it. */
export interface DraftRow {
  date: string | null
  amount: string
  currency: string
  description: string
  category: string | null
  type: TransactionType
  confidence: number
  flags: DraftFlag[]
  source: 'parser' | 'llm'
  boxes: OcrLine['box'][]
}

export interface ParseResponse {
  layout: 'bank-list' | 'receipt' | 'uber-activity' | 'uber-eats-orders' | 'wechat-pay' | 'unknown'
  layoutConfidence: number
  model: string
  warnings: string[]
  rows: DraftRow[]
  unparsedLines: string[]
}

/** A row on the review screen: the draft's values, now editable. */
export interface ReviewRow {
  key: string
  shotId: number
  selected: boolean
  edited: boolean
  date: string
  amount: string
  currency: string
  description: string
  category: string
  type: TransactionType
  flags: DraftFlag[]
  source: 'parser' | 'llm'
  boxes: OcrLine['box'][]
}

export const CURRENCIES = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY']

/** Flags that mean "look at this row" — the rest are informational. */
export const WARNING_FLAGS: DraftFlag[] = [
  'arithmetic_failed', 'balance_mismatch', 'corrected_chars', 'low_confidence', 'missing_date', 'type_guessed',
]

export const needsAttention = (row: Pick<ReviewRow, 'flags'>) =>
  row.flags.some((flag) => WARNING_FLAGS.includes(flag))

/** Why a row needs checking, most serious first, as translation keys. */
const REASONS: [DraftFlag, string][] = [
  ['balance_mismatch', 'Does not match the running balance'],
  ['arithmetic_failed', 'Receipt totals do not add up'],
  ['corrected_chars', 'Some characters were guessed'],
  ['low_confidence', 'Hard to read'],
  ['missing_date', 'No date found'],
  ['type_guessed', 'Income or expense was guessed'],
]

export const attentionReasons = (row: Pick<ReviewRow, 'flags'>) =>
  REASONS.filter(([flag]) => row.flags.includes(flag)).map(([, reason]) => reason)

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/
const AMOUNT = /^\d{1,8}\.\d{2}$/

function isRealDay(value: string) {
  const m = DAY.exec(value)
  if (!m) return false
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])]
  const leap = (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
  const days = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  return mo >= 1 && mo <= 12 && d >= 1 && d <= days[mo - 1]
}

/**
 * What a user typed into an amount cell, as the API wants it: "12.5" ->
 * "12.50", "1,234" -> "1234.00". Null for anything that is not a positive
 * amount of at most eight whole digits.
 */
export function normalizeAmount(input: string): string | null {
  const m = /^\s*\$?\s*(\d{1,3}(?:,\d{3})+|\d+)(?:\.(\d{1,2}))?\s*$/.exec(input)
  if (!m) return null
  const whole = m[1].replace(/,/g, '').replace(/^0+(?=\d)/, '')
  const value = `${whole}.${(m[2] ?? '').padEnd(2, '0')}`
  return AMOUNT.test(value) && value !== '0.00' ? value : null
}

/** Whether a row has everything POST /transactions/import will check. */
export function isComplete(row: ReviewRow) {
  return isRealDay(row.date)
    && AMOUNT.test(row.amount)
    && row.amount !== '0.00'
    && row.description.trim().length > 0
    && row.description.trim().length <= 255
    && row.category.trim().length > 0
    && CURRENCIES.includes(row.currency)
}

const identity = (row: Pick<ReviewRow, 'date' | 'amount' | 'currency' | 'description'>) =>
  [row.date, row.amount, row.currency, row.description.trim().toLowerCase()].join('|')

/**
 * Draft rows from one screenshot, ready for the table. A row identical to one
 * already on screen — the same list screenshotted twice, overlapping — is
 * marked a possible duplicate, as the server does for rows already saved.
 * Duplicates and incomplete rows start unticked.
 */
export function toReviewRows(shotId: number, drafts: DraftRow[], existing: ReviewRow[]): ReviewRow[] {
  const seen = new Set(existing.map(identity))
  return drafts.map((draft, index) => {
    const row: ReviewRow = {
      key: `${shotId}-${index}`,
      shotId,
      selected: false,
      edited: false,
      date: draft.date ?? '',
      amount: draft.amount,
      currency: draft.currency,
      description: draft.description,
      category: draft.category ?? '',
      type: draft.type,
      flags: [...draft.flags],
      source: draft.source,
      boxes: draft.boxes,
    }
    if (seen.has(identity(row)) && !row.flags.includes('possible_duplicate')) {
      row.flags.push('possible_duplicate')
    }
    seen.add(identity(row))
    row.selected = isComplete(row) && !row.flags.includes('possible_duplicate')
    return row
  })
}

/** Sums of the ticked rows, per currency, in the API's two-decimal form. */
export function totalsByCurrency(rows: ReviewRow[]): { currency: string; income: string; expense: string }[] {
  const cents = new Map<string, { income: number; expense: number }>()
  for (const row of rows) {
    if (!row.selected || !AMOUNT.test(row.amount)) continue
    const entry = cents.get(row.currency) ?? { income: 0, expense: 0 }
    entry[row.type] += Number(row.amount.replace('.', ''))
    cents.set(row.currency, entry)
  }
  const format = (c: number) => `${Math.floor(c / 100)}.${String(c % 100).padStart(2, '0')}`
  return [...cents.entries()].map(([currency, { income, expense }]) => ({
    currency, income: format(income), expense: format(expense),
  }))
}

/** The body of POST /transactions/import for the ticked rows, in table order. */
export function toImportPayload(rows: ReviewRow[]) {
  return {
    rows: rows.filter((row) => row.selected).map((row) => ({
      date: row.date,
      amount: row.amount,
      description: row.description.trim(),
      category: row.category,
      type: row.type,
      currency: row.currency,
      source: row.source === 'llm' ? 'ocr_llm' : 'ocr',
      edited: row.edited,
    })),
  }
}
