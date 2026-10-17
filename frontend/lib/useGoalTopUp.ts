import { useEffect, useMemo, useState } from 'react'
import { api } from '@/utils/api'
import { toDay, previousMonth } from '@/lib/date'

/** The goal fields eligibility reads. NUMERIC columns may arrive as strings. */
export interface TopUpGoalBase {
  id: number
  target_amount: number | string
  current_amount: number | string | null
  target_date: string
  currency?: string
}

export const toCents = (value: number | string | null) => Math.round(Number(value ?? 0) * 100)

/** One dismissal per viewer and month. Storage may throw; callers must still work. */
function dismissalKey(): string {
  try {
    const user = JSON.parse(localStorage.getItem('user') || '{}') as { id?: number }
    return `goalTopUpDismissed:${user.id ?? 'unknown'}`
  } catch {
    return 'goalTopUpDismissed:unknown'
  }
}

function readDismissed(month: string): boolean {
  try {
    return localStorage.getItem(dismissalKey()) === month
  } catch {
    return false
  }
}

function storeDismissed(month: string) {
  try {
    localStorage.setItem(dismissalKey(), month)
  } catch {
    // Per-viewer convenience only: hidden for this visit either way.
  }
}

/**
 * The single definition of "is a top-up suggestion available": last month's
 * net is positive, at least one goal is unreached, and that month has not been
 * dismissed. The Goals-page card and the dashboard badge both use it.
 * `selectedId` lets the card look at a goal other than the nearest one.
 */
export function useGoalTopUp<G extends TopUpGoalBase>(goals: G[], selectedId: number | null = null) {
  const month = useMemo(() => previousMonth(), [])
  const [dismissed, setDismissed] = useState(true)
  // Last month's net, in cents, per currency it was converted into. null means
  // the summary or a conversion failed: no suggestion rather than a wrong one.
  const [leftover, setLeftover] = useState<Record<string, number | null>>({})

  useEffect(() => {
    setDismissed(readDismissed(month.key))
  }, [month.key])

  // Not yet reached, nearest target date first.
  const active = useMemo(
    () => goals
      .filter((g) => toCents(g.current_amount) < toCents(g.target_amount))
      .sort((a, b) => (toDay(a.target_date) ?? '9999').localeCompare(toDay(b.target_date) ?? '9999') || a.id - b.id),
    [goals],
  )
  const goal = active.find((g) => g.id === selectedId) ?? active[0]
  const currency = goal?.currency || 'CAD'
  const leftoverCents = leftover[currency]

  useEffect(() => {
    if (dismissed || !goal || leftover[currency] !== undefined) return
    let cancelled = false
    api.get('/summary/monthly', { params: { year: month.year, month: month.month, targetCurrency: currency } })
      .then((res) => {
        const net = Number(res.data?.netIncome)
        if (!cancelled) setLeftover((prev) => ({ ...prev, [currency]: Number.isFinite(net) ? Math.round(net * 100) : null }))
      })
      .catch(() => {
        if (!cancelled) setLeftover((prev) => ({ ...prev, [currency]: null }))
      })
    return () => { cancelled = true }
  }, [dismissed, goal, currency, leftover, month])

  const dismiss = () => {
    storeDismissed(month.key)
    setDismissed(true)
  }

  const available = !dismissed && !!goal && leftoverCents != null && leftoverCents > 0
  return { month, active, goal, currency, leftoverCents, available, dismiss }
}
