import { useEffect, useState } from 'react'
import { useTranslation } from 'next-i18next'
import toast from 'react-hot-toast'
import { PiggyBank } from 'lucide-react'
import { api } from '@/utils/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Card, CardContent } from '@/components/ui/card'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { formatCurrency } from '@/utils/formatters'
import { toDay, formatMonth } from '@/lib/date'
import { useGoalTopUp, toCents } from '@/lib/useGoalTopUp'

/** The goal fields this card reads. NUMERIC columns may arrive as strings. */
interface TopUpGoal {
  id: number
  name: string
  target_amount: number | string
  current_amount: number | string | null
  target_date: string
  description: string | null
  currency: string
}

interface Props {
  goals: TopUpGoal[]
  onAdded: () => void
}

// Same shape the edit form accepts, but strictly positive and at most two
// decimals: rounding a longer entry could add more than the user typed.
const AMOUNT = /^\d+(\.\d{1,2})?$/

/**
 * "You had $X left over last month. Add some to a goal?"
 *
 * One card for all goals, not one per goal: last month's leftover is one sum
 * of money, and offering it to every goal would count it several times.
 * Nothing is written until the user presses "Add to goal".
 */
export default function GoalTopUpSuggestion({ goals, onAdded }: Props) {
  const { t, i18n } = useTranslation('common')
  const [selectedId, setSelectedId] = useState<number | null>(null)
  const { month, active, goal, currency, leftoverCents, available, dismiss } = useGoalTopUp(goals, selectedId)
  const [amount, setAmount] = useState('')
  const [saving, setSaving] = useState(false)

  // Prefill with what is left over, but no more than the goal still needs.
  useEffect(() => {
    if (!goal || leftoverCents == null || leftoverCents <= 0) return
    const remaining = toCents(goal.target_amount) - toCents(goal.current_amount)
    setAmount((Math.min(leftoverCents, remaining) / 100).toFixed(2))
  }, [goal, leftoverCents])

  if (!available || !goal || leftoverCents == null) return null

  const valid = AMOUNT.test(amount.trim()) && Number(amount) > 0
  const addCents = valid ? toCents(amount.trim()) : 0
  const fromCents = toCents(goal.current_amount)

  const add = async () => {
    if (!valid) return
    setSaving(true)
    try {
      // Re-read the goal so the addition lands on its latest saved amount,
      // not the one this page loaded.
      const res = await api.get('/goals')
      const latest = (res.data.goals as TopUpGoal[]).find((g) => g.id === goal.id)
      if (!latest) {
        toast.error(t('goalTopUp.notFound'))
        onAdded()
        return
      }
      await api.put(`/goals/${latest.id}`, {
        name: latest.name,
        target_amount: Number(latest.target_amount),
        current_amount: (toCents(latest.current_amount) + addCents) / 100,
        target_date: toDay(latest.target_date),
        description: latest.description,
        currency: latest.currency,
      })
      dismiss()
      toast.success(t('goalTopUp.added', {
        amount: formatCurrency(addCents / 100, latest.currency),
        name: latest.name,
        interpolation: { escapeValue: false },
      }))
      onAdded()
    } catch (error) {
      // The shared client has already shown the error.
      console.error('Goal top-up error:', error)
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="mb-6 border-primary/40">
      <CardContent className="pt-6 space-y-4">
        <div className="flex items-start gap-3">
          <PiggyBank className="w-6 h-6 text-primary shrink-0 mt-0.5" aria-hidden="true" />
          <p className="text-base font-medium">
            {t('goalTopUp.title', {
              amount: formatCurrency(leftoverCents / 100, currency),
              month: formatMonth(month.year, month.month, i18n.language),
              interpolation: { escapeValue: false },
            })}
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="topup-goal">{t('goalTopUp.goal')}</Label>
            <Select value={String(goal.id)} onValueChange={(value) => setSelectedId(Number(value))}>
              <SelectTrigger id="topup-goal">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {active.map((g) => (
                  <SelectItem key={g.id} value={String(g.id)}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="topup-amount">{t('goalTopUp.amount', { currency })}</Label>
            <Input
              id="topup-amount"
              type="number"
              inputMode="decimal"
              step="0.01"
              min="0.01"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              aria-invalid={!valid}
              aria-describedby="topup-preview"
            />
          </div>
        </div>

        <p id="topup-preview" className={valid ? 'text-sm text-muted-foreground' : 'text-sm text-destructive'}>
          {valid
            ? t('goalTopUp.preview', {
              name: goal.name,
              from: formatCurrency(fromCents / 100, goal.currency),
              to: formatCurrency((fromCents + addCents) / 100, goal.currency),
              target: formatCurrency(toCents(goal.target_amount) / 100, goal.currency),
              interpolation: { escapeValue: false },
            })
            : t('goalTopUp.invalidAmount')}
        </p>

        <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
          <Button variant="outline" onClick={dismiss} disabled={saving}>
            {t('goalTopUp.notNow')}
          </Button>
          <Button onClick={add} disabled={!valid || saving}>
            {t('goalTopUp.add')}
          </Button>
        </div>
      </CardContent>
    </Card>
  )
}
