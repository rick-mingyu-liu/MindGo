import { useTranslation } from 'next-i18next'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { categories } from '@/pages/transactions/new'
import { DraftRow } from '@/utils/agentApi'

export const currencies = ['CAD', 'USD', 'EUR', 'GBP', 'AUD', 'CNY']
export const selectClass = 'h-9 w-full rounded-md border border-input bg-background px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring'

export default function DraftEditor({ rows, selected, disabled, onChange, onSelect }: {
  rows: DraftRow[]; selected: string[]; disabled: boolean
  onChange: (rows: DraftRow[]) => void; onSelect: (ids: string[]) => void
}) {
  const { t } = useTranslation('common')
  const update = (id: string, changes: Partial<DraftRow>) => onChange(rows.map(row => row.id === id ? { ...row, ...changes } : row))
  return <div className="space-y-3">
    <Button variant="ghost" size="sm" disabled={disabled} onClick={() => onSelect(selected.length === rows.length ? [] : rows.map(row => row.id))}>{t(selected.length === rows.length ? 'agent.selectNone' : 'agent.selectAll')}</Button>
    {rows.map((row, index) => <fieldset key={row.id} disabled={disabled} className="min-w-0 rounded-lg border p-4">
      <legend className="px-1 text-sm font-medium">{t('agent.row', { number: index + 1 })}</legend>
      <label className="mb-3 flex items-center gap-2 text-sm"><input type="checkbox" checked={selected.includes(row.id)} onChange={e => onSelect(e.target.checked ? [...selected, row.id] : selected.filter(id => id !== row.id))} />{t('agent.include')}</label>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm sm:col-span-2"><span>{t('agent.description')}</span><Input value={row.description} maxLength={255} onChange={e => update(row.id, { description: e.target.value })} /></label>
        <label className="space-y-1 text-sm"><span>{t('agent.amount')}</span><Input inputMode="decimal" value={row.amount} onChange={e => update(row.id, { amount: e.target.value })} /></label>
        <label className="space-y-1 text-sm"><span>{t('agent.currency')}</span><select className={selectClass} value={row.currency} onChange={e => update(row.id, { currency: e.target.value })}>{currencies.map(currency => <option key={currency}>{currency}</option>)}</select></label>
        <label className="space-y-1 text-sm"><span>{t('agent.date')}</span><Input type="date" className="dark:[color-scheme:dark]" value={row.date} onChange={e => update(row.id, { date: e.target.value })} /></label>
        <label className="space-y-1 text-sm"><span>{t('agent.type')}</span><select className={selectClass} value={row.type} onChange={e => { const type = e.target.value as DraftRow['type']; update(row.id, { type, category: categories[type][0] }) }}><option value="expense">{t('agent.expense')}</option><option value="income">{t('agent.income')}</option></select></label>
        <label className="space-y-1 text-sm sm:col-span-2"><span>{t('agent.category')}</span><select className={selectClass} value={row.category} onChange={e => update(row.id, { category: e.target.value })}>{categories[row.type].map(category => <option key={category} value={category}>{t(category)}</option>)}</select></label>
      </div>
    </fieldset>)}
  </div>
}
