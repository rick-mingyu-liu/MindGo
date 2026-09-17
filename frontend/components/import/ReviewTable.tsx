import { useTranslation } from 'next-i18next'
import { ImageIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { categories } from '@/pages/transactions/new'
import {
  CURRENCIES, attentionReasons, isComplete, normalizeAmount,
  type ReviewRow, type TransactionType,
} from '@/lib/import/review'
import { cn } from '@/lib/utils'

interface ReviewTableProps {
  rows: ReviewRow[]
  invalidKeys: Set<string>
  onChange: (key: string, patch: Partial<ReviewRow>) => void
  onShowSource: (key: string) => void
}

const selectClass =
  'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring'

/**
 * Every draft transaction, editable before anything is saved. Editing a value
 * marks the row as edited — the count of corrected rows is what the
 * import_batches table records.
 *
 * A table from the md breakpoint up; below it, one card per row, because a
 * seven-column table on a phone scrolls sideways and hides the badges.
 */
export function ReviewTable({ rows, invalidKeys, onChange, onShowSource }: ReviewTableProps) {
  const { t } = useTranslation('common')
  const fieldsFor = (row: ReviewRow) => rowFields(row, t, onChange, onShowSource)

  return (
    <>
      <ul className="space-y-3 md:hidden">
        {rows.map((row) => {
          const f = fieldsFor(row)
          return (
            <li
              key={row.key}
              className={cn(
                'space-y-3 rounded-md border p-3',
                invalidKeys.has(row.key) && 'border-destructive bg-destructive/10',
                !row.selected && 'opacity-70'
              )}
            >
              <div className="flex items-start gap-2">
                <div className="pt-2">{f.select}</div>
                <div className="min-w-0 flex-1">{f.description}{f.badges}</div>
                {f.source}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {f.date}
                {f.amount}
                {f.category}
                {f.type}
                {f.currency}
              </div>
            </li>
          )
        })}
      </ul>

      <div className="hidden md:block">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10"><span className="sr-only">{t('Select')}</span></TableHead>
              <TableHead className="min-w-[9rem]">{t('Date')}</TableHead>
              <TableHead className="min-w-[12rem]">{t('Description')}</TableHead>
              <TableHead className="min-w-[9rem]">{t('Category')}</TableHead>
              <TableHead className="min-w-[6.5rem]">{t('Type')}</TableHead>
              <TableHead className="min-w-[6.5rem] text-right">{t('Amount')}</TableHead>
              <TableHead className="min-w-[5.5rem]">{t('Currency')}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((row) => {
              const f = fieldsFor(row)
              return (
                <TableRow
                  key={row.key}
                  className={cn(invalidKeys.has(row.key) && 'bg-destructive/10', !row.selected && 'opacity-70')}
                >
                  <TableCell className="space-y-1 text-center">{f.select}{f.source}</TableCell>
                  <TableCell>{f.date}</TableCell>
                  {/* Badges sit under the description rather than in a column of
                      their own: they are the one thing on a row that must be seen. */}
                  <TableCell>{f.description}{f.badges}</TableCell>
                  <TableCell>{f.category}</TableCell>
                  <TableCell>{f.type}</TableCell>
                  <TableCell>{f.amount}</TableCell>
                  <TableCell>{f.currency}</TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </div>
    </>
  )
}

/** One row's editors, laid out by whichever view renders them. */
function rowFields(
  row: ReviewRow,
  t: (key: string) => string,
  onChange: ReviewTableProps['onChange'],
  onShowSource: ReviewTableProps['onShowSource'],
) {
  const edit = (patch: Partial<ReviewRow>) => onChange(row.key, { ...patch, edited: true })
  const complete = isComplete(row)
  return {
    select: (
      <input
        type="checkbox"
        className="h-4 w-4 accent-primary"
        checked={row.selected}
        disabled={!complete}
        title={complete ? undefined : t('This row is missing a date, description or category, or its amount is not valid.')}
        aria-label={t('Select')}
        onChange={(event) => onChange(row.key, { selected: event.target.checked })}
      />
    ),
    source: (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label={t('Show where this was read')}
        title={t('Show where this was read')}
        onClick={() => onShowSource(row.key)}
      >
        <ImageIcon className="h-4 w-4" />
      </Button>
    ),
    date: (
      <Input
        type="date"
        value={row.date}
        aria-label={t('Date')}
        onChange={(event) => edit({ date: event.target.value })}
      />
    ),
    description: (
      <Input
        value={row.description}
        maxLength={255}
        aria-label={t('Description')}
        onChange={(event) => edit({ description: event.target.value })}
      />
    ),
    badges: <RowBadges row={row} />,
    category: (
      <select
        className={selectClass}
        value={row.category}
        aria-label={t('Category')}
        onChange={(event) => edit({ category: event.target.value })}
      >
        <option value="">{t('Select a category')}</option>
        {categories[row.type].map((category) => (
          <option key={category} value={category}>{t(category)}</option>
        ))}
      </select>
    ),
    type: (
      <select
        className={selectClass}
        value={row.type}
        aria-label={t('Type')}
        onChange={(event) => {
          const type = event.target.value as TransactionType
          // A category belongs to one type; keep it only if it still fits.
          const category = (categories[type] as string[]).includes(row.category) ? row.category : ''
          edit({ type, category })
        }}
      >
        <option value="expense">{t('Expense')}</option>
        <option value="income">{t('Income')}</option>
      </select>
    ),
    amount: <AmountInput value={row.amount} label={t('Amount')} onCommit={(amount) => edit({ amount })} />,
    currency: (
      <select
        className={selectClass}
        value={row.currency}
        aria-label={t('Currency')}
        onChange={(event) => edit({ currency: event.target.value })}
      >
        {CURRENCIES.map((currency) => <option key={currency} value={currency}>{currency}</option>)}
      </select>
    ),
  }
}

function RowBadges({ row }: { row: ReviewRow }) {
  const { t } = useTranslation('common')
  const reasons = attentionReasons(row).map((reason) => t(reason))
  const badges = [
    row.flags.includes('arithmetic_verified') && (
      <Badge key="verified" className="bg-emerald-600 text-white hover:bg-emerald-600">{t('Amount checked')}</Badge>
    ),
    // Once the user has edited the row, they have looked at it.
    reasons.length > 0 && !row.edited && (
      <Badge key="check" variant="destructive" title={reasons.join(' · ')}>
        {t('Check')}: {reasons[0]}{reasons.length > 1 ? ` +${reasons.length - 1}` : ''}
      </Badge>
    ),
    row.flags.includes('pending') && <Badge key="pending" variant="secondary">{t('Pending')}</Badge>,
    row.flags.includes('possible_duplicate') && (
      <Badge key="duplicate" variant="outline">{t('Possible duplicate')}</Badge>
    ),
    row.source === 'llm' && <Badge key="llm" variant="outline">{t('AI-read')}</Badge>,
  ].filter(Boolean)
  if (badges.length === 0) return null
  return <div className="mt-1 flex flex-wrap gap-1">{badges}</div>
}

/**
 * Edits an amount as free text and hands back the API's two-decimal form on
 * blur. Input that is not an amount is shown as invalid and not committed.
 */
function AmountInput({ value, label, onCommit }: { value: string; label: string; onCommit: (amount: string) => void }) {
  return (
    <Input
      key={value}
      defaultValue={value}
      inputMode="decimal"
      aria-label={label}
      className="text-right tabular-nums"
      onBlur={(event) => {
        const amount = normalizeAmount(event.target.value)
        if (amount === null) {
          event.target.setAttribute('aria-invalid', 'true')
          event.target.classList.add('border-destructive')
          return
        }
        event.target.removeAttribute('aria-invalid')
        event.target.classList.remove('border-destructive')
        if (amount !== value) onCommit(amount)
        else event.target.value = amount
      }}
    />
  )
}
