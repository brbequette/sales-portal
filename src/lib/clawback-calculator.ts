/**
 * Clawback Cascade Calculator
 * 
 * Calculates the financial impact of clawing back unpaid invoices:
 * - How monthly sales totals change
 * - Whether monthly goals flip from MET → MISSED
 * - VIG rate changes in the following month (1.3 → 1.5)
 * - Commission deltas across affected documents
 * - Bonus reversals
 * - Rep charge-off cost (50% of dead cost + shipping)
 * 
 * Supports both one-month and recursive cascade depth projections.
 */

export interface ClawbackSettings {
  clawback_threshold_days: number   // days overdue until write-off; default 120
  warning_window_days: number       // warning lead time; default 90 (risk begins at 30 overdue)
  rep_cost_split_pct: number        // default 0.50
  auto_cascade: boolean             // default false (warning-only)
  auto_bonus_reversal: boolean      // default false (flagged for review)
  cascade_depth: 'one_month' | 'recursive'  // default one_month
}

export const DEFAULT_CLAWBACK_SETTINGS: ClawbackSettings = {
  clawback_threshold_days: 120,
  warning_window_days: 90,
  rep_cost_split_pct: 0.50,
  auto_cascade: false,
  auto_bonus_reversal: false,
  cascade_depth: 'one_month',
}

export interface InvoiceForClawback {
  id: string
  invoiceNumber?: string | null
  issueDate: string | Date
  dueDate?: string | Date | null
  amount: number          // subtotal
  deadCost: number
  deadProfit: number
  profit: number          // after-VIG profit
  vigRate: number
  actualShippingCost: number
  isPaid: boolean
  daysOld: number          // days overdue (retained name for API compatibility)
  repId: string
  accountName: string
  contactName?: string | null
  contactPhone?: string | null
  commission: {
    upfront: number
    final: number
    future: number
    total: number
  }
}

export interface MonthlyGoalRecord {
  monthKey: string        // YYYY-MM
  repId: string
  metric: string          // PROFIT | SUBTOTAL
  profitGoal: number
  subtotalGoal: number
  manualVigRate?: number | null
}

export interface MonthlyInvoiceSummary {
  monthKey: string
  totalSales: number
  totalProfit: number
  totalDeadProfit: number
  invoiceCount: number
}

export interface GoalBonusConfig {
  id: string
  metric: string          // SUBTOTAL | NET_PROFIT | DEAD_PROFIT | INVOICES_COUNT
  targetValue: number
  bonusAmount: number
  cadence: string         // MONTHLY
  isActive: boolean
}

// ─── Impact projection for a single month ───────────────────────────────────

export interface MonthImpact {
  monthKey: string
  originalSales: number
  revisedSales: number
  salesDelta: number
  originalProfit: number
  revisedProfit: number
  profitDelta: number
  originalDeadProfit: number
  revisedDeadProfit: number
  originalGoalStatus: 'MET' | 'MISSED' | 'NO_GOAL'
  revisedGoalStatus: 'MET' | 'MISSED' | 'NO_GOAL'
  goalStatusChanged: boolean
  originalVigRate: number  // VIG applied in the NEXT month due to this month's goal
  revisedVigRate: number
  vigRateChanged: boolean
  // Commission impact on next month's documents due to VIG change
  nextMonthDocCount: number
  nextMonthProfitDelta: number
  nextMonthCommissionDelta: number
  bonusReversed: number
  clawedInvoices: string[]  // invoice numbers removed from this month
}

// ─── Full clawback impact result ─────────────────────────────────────────────

export interface ClawbackImpact {
  oneMonth: {
    monthsAffected: MonthImpact[]
    totalRepChargeOffCost: number
    totalCommissionClawed: number
    totalBonusReversed: number
    totalVigImpact: number
    totalImpact: number
  }
  recursive: {
    monthsAffected: MonthImpact[]
    totalRepChargeOffCost: number
    totalCommissionClawed: number
    totalBonusReversed: number
    totalVigImpact: number
    totalImpact: number
  }
}

// ─── At-risk invoice with clawback details ───────────────────────────────────

export interface AtRiskInvoice extends InvoiceForClawback {
  daysToClawback: number
  isApproachingClawback: boolean
  chargeOffRepCost: number
  pendingCommission: number   // future commission not yet earned
  urgency: 'critical' | 'warning' | 'watch'  // <30, <60, <90 days
}

// ─── Helper: Get month key from date ─────────────────────────────────────────

function getMonthKey(date: Date | string): string {
  const d = new Date(date)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

function nextMonthKey(monthKey: string): string {
  const [y, m] = monthKey.split('-').map(Number)
  if (m === 12) return `${y + 1}-01`
  return `${y}-${String(m + 1).padStart(2, '0')}`
}

// ─── Classify at-risk invoices ───────────────────────────────────────────────

export function classifyAtRiskInvoices(
  invoices: InvoiceForClawback[],
  settings: ClawbackSettings
): AtRiskInvoice[] {
  const thresholdDays = settings.clawback_threshold_days
  const warningDays = settings.warning_window_days
  const warningStart = Math.max(0, thresholdDays - warningDays)

  return invoices
    .filter(inv => !inv.isPaid && inv.daysOld >= warningStart)
    .map(inv => {
      const daysToClawback = Math.max(0, thresholdDays - inv.daysOld)
      const isApproachingClawback = daysToClawback > 0 && daysToClawback <= warningDays
      const chargeOffRepCost = (inv.deadCost + inv.actualShippingCost) * settings.rep_cost_split_pct
      const pendingCommission = inv.commission.future

      let urgency: 'critical' | 'warning' | 'watch' = 'watch'
      if (daysToClawback <= 30) urgency = 'critical'
      else if (daysToClawback <= 60) urgency = 'warning'

      return {
        ...inv,
        daysToClawback,
        isApproachingClawback,
        chargeOffRepCost,
        pendingCommission,
        urgency,
      }
    })
    .sort((a, b) => a.daysToClawback - b.daysToClawback)
}

// ─── Calculate clawback cascade impact ───────────────────────────────────────

export function calculateClawbackImpact(
  atRiskInvoices: AtRiskInvoice[],
  monthlyHistory: MonthlyInvoiceSummary[],
  monthlyGoals: MonthlyGoalRecord[],
  bonusConfigs: GoalBonusConfig[],
  allInvoicesByMonth: Record<string, InvoiceForClawback[]>,
  settings: ClawbackSettings,
  defaultVigRate: number = 1.3,
  missedVigRate: number = 1.5
): ClawbackImpact {
  // Group at-risk invoices by their original sale month
  const byMonth: Record<string, AtRiskInvoice[]> = {}
  for (const inv of atRiskInvoices) {
    const mk = getMonthKey(inv.issueDate)
    if (!byMonth[mk]) byMonth[mk] = []
    byMonth[mk].push(inv)
  }

  const goalsByMonth = new Map(monthlyGoals.map(g => [g.monthKey, g]))
  const historyByMonth = new Map(monthlyHistory.map(h => [h.monthKey, h]))

  // ─── One-month cascade ─────────────────────────────────────────────────
  const oneMonthImpacts: MonthImpact[] = []
  let totalRepChargeOff = 0
  let totalCommClawed = 0
  let totalBonusReversed = 0
  let totalVigImpact = 0

  for (const [monthKey, clawedInvs] of Object.entries(byMonth)) {
    const history = historyByMonth.get(monthKey)
    if (!history) continue

    const salesRemoved = clawedInvs.reduce((s, inv) => s + inv.amount, 0)
    const profitRemoved = clawedInvs.reduce((s, inv) => s + inv.profit, 0)
    const deadProfitRemoved = clawedInvs.reduce((s, inv) => s + inv.deadProfit, 0)
    const commRemoved = clawedInvs.reduce((s, inv) => s + inv.commission.upfront, 0)
    const chargeOff = clawedInvs.reduce((s, inv) => s + inv.chargeOffRepCost, 0)

    totalRepChargeOff += chargeOff
    totalCommClawed += commRemoved

    const revisedSales = history.totalSales - salesRemoved
    const revisedProfit = history.totalProfit - profitRemoved
    const revisedDeadProfit = history.totalDeadProfit - deadProfitRemoved

    // Check goal status change
    const goal = goalsByMonth.get(monthKey)
    let origGoalStatus: 'MET' | 'MISSED' | 'NO_GOAL' = 'NO_GOAL'
    let revisedGoalStatus: 'MET' | 'MISSED' | 'NO_GOAL' = 'NO_GOAL'

    if (goal) {
      const metricOriginal = goal.metric === 'SUBTOTAL' ? history.totalSales : history.totalProfit
      const metricRevised = goal.metric === 'SUBTOTAL' ? revisedSales : revisedProfit
      const target = goal.metric === 'SUBTOTAL' ? goal.subtotalGoal : goal.profitGoal

      origGoalStatus = metricOriginal >= target ? 'MET' : 'MISSED'
      revisedGoalStatus = metricRevised >= target ? 'MET' : 'MISSED'
    }

    const goalStatusChanged = origGoalStatus !== revisedGoalStatus

    // VIG rate impact on NEXT month
    const origVigRate = origGoalStatus === 'MISSED' ? missedVigRate : defaultVigRate
    const revisedVigRate = revisedGoalStatus === 'MISSED' ? missedVigRate : defaultVigRate
    const vigRateChanged = origVigRate !== revisedVigRate

    // Calculate commission impact on next month's documents from VIG rate change
    const nextMk = nextMonthKey(monthKey)
    const nextMonthDocs = allInvoicesByMonth[nextMk] || []
    let nextMonthProfitDelta = 0
    let nextMonthCommDelta = 0

    if (vigRateChanged) {
      for (const doc of nextMonthDocs) {
        // Approximate: higher VIG increases deadCostPlusVig, reducing profit
        const vigDiff = revisedVigRate - origVigRate
        const costIncrease = doc.deadCost * vigDiff
        nextMonthProfitDelta -= costIncrease
        nextMonthCommDelta -= costIncrease * 0.50  // 50% commission split
      }
      totalVigImpact += nextMonthCommDelta
    }

    // Bonus reversal check
    let bonusReversed = 0
    if (goalStatusChanged && revisedGoalStatus === 'MISSED') {
      for (const bonus of bonusConfigs) {
        if (!bonus.isActive || bonus.cadence !== 'MONTHLY') continue
        // If the original goal was met and triggered this bonus, reverse it
        const metricVal = bonus.metric === 'SUBTOTAL' ? revisedSales :
          bonus.metric === 'NET_PROFIT' ? revisedProfit :
          bonus.metric === 'DEAD_PROFIT' ? revisedDeadProfit : 0
        if (metricVal < bonus.targetValue) {
          bonusReversed += bonus.bonusAmount
        }
      }
      totalBonusReversed += bonusReversed
    }

    oneMonthImpacts.push({
      monthKey,
      originalSales: history.totalSales,
      revisedSales,
      salesDelta: -salesRemoved,
      originalProfit: history.totalProfit,
      revisedProfit,
      profitDelta: -profitRemoved,
      originalDeadProfit: history.totalDeadProfit,
      revisedDeadProfit,
      originalGoalStatus: origGoalStatus,
      revisedGoalStatus: revisedGoalStatus,
      goalStatusChanged,
      originalVigRate: origVigRate,
      revisedVigRate: revisedVigRate,
      vigRateChanged,
      nextMonthDocCount: nextMonthDocs.length,
      nextMonthProfitDelta,
      nextMonthCommissionDelta: nextMonthCommDelta,
      bonusReversed,
      clawedInvoices: clawedInvs.map(i => i.invoiceNumber || i.id),
    })
  }

  const oneMonthResult = {
    monthsAffected: oneMonthImpacts.sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    totalRepChargeOffCost: totalRepChargeOff,
    totalCommissionClawed: totalCommClawed,
    totalBonusReversed: totalBonusReversed,
    totalVigImpact,
    totalImpact: totalRepChargeOff + totalCommClawed + totalBonusReversed + Math.abs(totalVigImpact),
  }

  // ─── Recursive cascade ─────────────────────────────────────────────────
  // Same as one-month, but if a goal flip changes VIG in month N+1,
  // check if that VIG change causes month N+1's goal to also flip, cascading to N+2, etc.
  const recursiveImpacts = [...oneMonthImpacts]
  let recursiveVigImpact = totalVigImpact
  let recursiveBonusReversed = totalBonusReversed
  let recursiveCommClawed = totalCommClawed

  // Build a set of months already processed
  const processedMonths = new Set(Object.keys(byMonth))

  // For each month where VIG changed, check the next month cascade
  const vigChangedMonths = oneMonthImpacts
    .filter(m => m.vigRateChanged)
    .map(m => nextMonthKey(m.monthKey))

  let cascadeQueue = [...vigChangedMonths]
  const maxDepth = 12 // Safety: don't cascade more than 12 months

  for (let depth = 0; depth < maxDepth && cascadeQueue.length > 0; depth++) {
    const nextQueue: string[] = []

    for (const mk of cascadeQueue) {
      if (processedMonths.has(mk)) continue
      processedMonths.add(mk)

      const history = historyByMonth.get(mk)
      if (!history) continue

      const goal = goalsByMonth.get(mk)
      if (!goal) continue

      // The previous month's cascade already changed this month's VIG rate
      // Now recalculate this month's totals with the new VIG
      const docs = allInvoicesByMonth[mk] || []
      const vigDelta = missedVigRate - defaultVigRate // The VIG was raised
      const totalCostIncrease = docs.reduce((s, d) => s + (d.deadCost * vigDelta), 0)
      const revisedProfit = history.totalProfit - totalCostIncrease

      const metricOriginal = goal.metric === 'SUBTOTAL' ? history.totalSales : history.totalProfit
      const metricRevised = goal.metric === 'SUBTOTAL' ? history.totalSales : revisedProfit
      const target = goal.metric === 'SUBTOTAL' ? goal.subtotalGoal : goal.profitGoal

      const origStatus: 'MET' | 'MISSED' = metricOriginal >= target ? 'MET' : 'MISSED'
      const revisedStatus: 'MET' | 'MISSED' = metricRevised >= target ? 'MET' : 'MISSED'
      const statusChanged = origStatus !== revisedStatus

      if (statusChanged && revisedStatus === 'MISSED') {
        // This month's goal also flipped — cascade to the next month
        const nextMk = nextMonthKey(mk)
        const nextDocs = allInvoicesByMonth[nextMk] || []
        let nextProfitDelta = 0
        let nextCommDelta = 0
        for (const doc of nextDocs) {
          const costInc = doc.deadCost * vigDelta
          nextProfitDelta -= costInc
          nextCommDelta -= costInc * 0.50
        }
        recursiveVigImpact += nextCommDelta

        let bonusRev = 0
        for (const bonus of bonusConfigs) {
          if (!bonus.isActive || bonus.cadence !== 'MONTHLY') continue
          const val = bonus.metric === 'SUBTOTAL' ? history.totalSales :
            bonus.metric === 'NET_PROFIT' ? revisedProfit : 0
          if (val < bonus.targetValue) bonusRev += bonus.bonusAmount
        }
        recursiveBonusReversed += bonusRev

        recursiveImpacts.push({
          monthKey: mk,
          originalSales: history.totalSales,
          revisedSales: history.totalSales, // Sales unchanged, only VIG changed
          salesDelta: 0,
          originalProfit: history.totalProfit,
          revisedProfit,
          profitDelta: revisedProfit - history.totalProfit,
          originalDeadProfit: history.totalDeadProfit,
          revisedDeadProfit: history.totalDeadProfit,
          originalGoalStatus: origStatus,
          revisedGoalStatus: revisedStatus,
          goalStatusChanged: statusChanged,
          originalVigRate: defaultVigRate,
          revisedVigRate: missedVigRate,
          vigRateChanged: true,
          nextMonthDocCount: nextDocs.length,
          nextMonthProfitDelta: nextProfitDelta,
          nextMonthCommissionDelta: nextCommDelta,
          bonusReversed: bonusRev,
          clawedInvoices: [], // No invoices removed — cascade-only impact
        })

        nextQueue.push(nextMk)
      }
    }

    cascadeQueue = nextQueue
  }

  const recursiveResult = {
    monthsAffected: recursiveImpacts.sort((a, b) => a.monthKey.localeCompare(b.monthKey)),
    totalRepChargeOffCost: totalRepChargeOff,
    totalCommissionClawed: recursiveCommClawed,
    totalBonusReversed: recursiveBonusReversed,
    totalVigImpact: recursiveVigImpact,
    totalImpact: totalRepChargeOff + recursiveCommClawed + recursiveBonusReversed + Math.abs(recursiveVigImpact),
  }

  return { oneMonth: oneMonthResult, recursive: recursiveResult }
}

// ─── Summary helpers for the frontend ────────────────────────────────────────

export function summarizePendingCommissions(invoices: InvoiceForClawback[]): {
  total: number
  count: number
  byWeek: { weekLabel: string; amount: number; count: number }[]
} {
  let total = 0
  let count = 0
  const weekMap: Record<string, { weekLabel: string; amount: number; count: number }> = {}

  for (const inv of invoices) {
    if (inv.isPaid) continue
    const pending = inv.commission.future
    if (pending <= 0) continue

    total += pending
    count++

    const d = new Date(inv.issueDate)
    const monday = new Date(d)
    monday.setDate(d.getDate() - d.getDay() + (d.getDay() === 0 ? -6 : 1))
    const sunday = new Date(monday)
    sunday.setDate(sunday.getDate() + 6)
    const key = monday.toISOString().split('T')[0]
    const weekLabel = `${monday.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${sunday.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}`

    if (!weekMap[key]) weekMap[key] = { weekLabel, amount: 0, count: 0 }
    weekMap[key].amount += pending
    weekMap[key].count++
  }

  return {
    total,
    count,
    byWeek: Object.values(weekMap).sort((a, b) => b.weekLabel.localeCompare(a.weekLabel)),
  }
}
