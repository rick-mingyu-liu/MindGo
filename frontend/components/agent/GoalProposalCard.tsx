import { ReactNode } from 'react'
import Link from 'next/link'
import { useTranslation } from 'next-i18next'
import { ArrowRight, Target } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Progress } from '@/components/ui/progress'
import { cn } from '@/lib/utils'
import { formatDay } from '@/lib/date'
import { formatCurrency } from '@/utils/formatters'
import { GoalFields, GoalProposal } from '@/utils/agentApi'

const FIELDS = ['name', 'target_amount', 'current_amount', 'currency', 'target_date', 'description'] as const
type Field = typeof FIELDS[number]
const LABELS: Record<Field, string> = {
  name: 'Goal Name', target_amount: 'Target Amount', current_amount: 'Current Amount',
  currency: 'Currency', target_date: 'Target Date', description: 'Description',
}

const progressOf = (goal: GoalFields) => {
  const target = Number(goal.target_amount)
  return target > 0 ? Math.max(0, (Number(goal.current_amount) / target) * 100) : 0
}

export default function GoalProposalCard({ proposal, expired, expiresLabel, confirmDisabled, discardDisabled, recovering, recoveryChecked, onConfirm, onDiscard, onDismissRecovery }: {
  proposal: GoalProposal
  // Pending, but past its deadline on this device's clock.
  expired: boolean
  expiresLabel: string
  confirmDisabled: boolean
  discardDisabled: boolean
  // A confirmation whose outcome is unknown; Confirm replays the same request.
  recovering: boolean
  recoveryChecked: boolean
  onConfirm: () => void
  onDiscard: () => void
  onDismissRecovery: () => void
}) {
  const { t, i18n } = useTranslation('common')
  const { before, after } = proposal
  // An update without its earlier values is shown like a new goal.
  const previous = proposal.action === 'update' ? before : null
  const update = previous !== null
  const status = proposal.status === 'pending' && expired ? 'expired' : proposal.status
  const headingId = `goal-proposal-${proposal.id}`

  const show = (goal: GoalFields, field: Field): string => {
    const value = goal[field]
    if (field === 'target_amount' || field === 'current_amount') return formatCurrency(Number(value), goal.currency)
    if (field === 'target_date') return value ? formatDay(value, i18n.language) : t('agent.goal.noDate')
    if (field === 'description') return value || t('agent.goal.noDescription')
    return value ?? ''
  }
  // An update shows only what changes; a new goal shows everything.
  const fields = previous ? FIELDS.filter(field => previous[field] !== after[field]) : FIELDS
  const row = (label: string, value: ReactNode) => <div key={label} className="grid grid-cols-1 gap-1 py-2 sm:grid-cols-[10rem_minmax(0,1fr)] sm:gap-3">
    <dt className="text-muted-foreground">{label}</dt>
    <dd className="min-w-0 break-words">{value}</dd>
  </div>
  const change = (from: string, to: string) => <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
    <span className="sr-only">{t('agent.goal.from')}</span>
    <del className="text-muted-foreground">{from}</del>
    <ArrowRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
    <span className="sr-only">{t('agent.goal.to')}</span>
    <ins className="rounded bg-primary/10 px-1.5 py-0.5 font-medium no-underline">{to}</ins>
  </span>
  const progressBefore = previous ? progressOf(previous) : null
  const progressAfter = progressOf(after)
  const percent = (value: number) => `${value.toFixed(1)}%`

  return <Card>
    <section aria-labelledby={headingId}>
      <CardHeader className="space-y-1">
        <h2 id={headingId} className="flex items-center gap-2 font-semibold leading-none tracking-tight"><Target className="h-5 w-5 shrink-0" aria-hidden="true" />{t(update ? 'agent.goal.updateTitle' : 'agent.goal.createTitle')}</h2>
        <p className="break-words text-sm text-muted-foreground">{previous ? previous.name : after.name}{status === 'pending' && ` · ${expiresLabel}`}</p>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y text-sm">
          {fields.map(field => row(t(LABELS[field]), previous
            ? change(show(previous, field), show(after, field))
            : <span className={cn(field === 'description' && 'whitespace-pre-wrap')}>{show(after, field)}</span>))}
          {update && !fields.length && <div className="py-2 text-muted-foreground">{t('agent.goal.noChanges')}</div>}
          {row(t('Progress'), <div className="space-y-2">
            {progressBefore !== null && percent(progressBefore) !== percent(progressAfter)
              ? change(percent(progressBefore), percent(progressAfter))
              : <span className="font-medium">{percent(progressAfter)}</span>}
            <Progress value={Math.min(100, progressAfter)} className="h-2" aria-label={t('Progress')} />
          </div>)}
        </dl>
        {status === 'pending' && <>
          <p className="text-sm text-muted-foreground">{t('agent.goal.hint')}</p>
          {recovering && <p className="text-sm">{t('agent.recoverHint')}</p>}
          <div className="flex flex-wrap gap-2">
            <Button disabled={confirmDisabled} onClick={onConfirm}>{t(recovering ? 'agent.goal.recoverConfirm' : update ? 'agent.goal.confirmUpdate' : 'agent.goal.confirmCreate')}</Button>
            {recovering && recoveryChecked && <Button variant="ghost" disabled={discardDisabled} onClick={onDismissRecovery}>{t('agent.dismissRecovery')}</Button>}
            {!recovering && <Button variant="ghost" disabled={discardDisabled} onClick={onDiscard}>{t('agent.goal.discard')}</Button>}
          </div>
        </>}
        {status === 'confirmed' && <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-green-600/30 bg-green-500/10 p-3 text-sm">
          <p>{t(update ? 'agent.goal.updated' : 'agent.goal.created')}</p>
          <Button variant="outline" size="sm" asChild><Link href="/goals">{t('agent.goal.viewGoals')}<ArrowRight className="h-4 w-4" /></Link></Button>
        </div>}
        {status === 'cancelled' && <p className="rounded-lg border bg-muted p-3 text-sm">{t('agent.goal.discarded')}</p>}
        {status === 'expired' && <p className="rounded-lg border bg-muted p-3 text-sm">{t('agent.goal.expired')}</p>}
        {status === 'conflict' && <p className="rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-sm">{t('agent.goal.conflict')}</p>}
      </CardContent>
    </section>
  </Card>
}
