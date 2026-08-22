import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { corsHeaders, handleOptions } from "./lib/cors"

/**
 * GET /.netlify/functions/vig-history
 *
 * Returns 72-month VIG rate history for all reps, aggregated from:
 *  - MonthlyVigGoal table (stored goals/manual overrides)
 *  - Invoice table (actual subtotal/profit per rep per month)
 *
 * Also returns mismatched invoices per rep per month:
 *  invoices where the stored cf_salesperson_vig != the expected rate for that rep/month.
 *
 * Query params:
 *  months     number  how many months back (default 24, max 72)
 *  repId      string  filter to single rep (optional)
 *  mismatches boolean include mismatch invoice lists (default true, can be slow for large DBs)
 */
const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method not allowed" }) }
  }

  try {
    const params   = event.queryStringParameters || {}
    const months   = Math.min(parseInt(params.months || "24", 10), 72)
    const repFilter = params.repId || null
    const includeMismatches = params.mismatches !== "false"

    const now = new Date()

    // ── 1. Build month key list ────────────────────────────────────────────
    const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December']
    const monthKeys: string[] = []
    for (let i = 0; i < months; i++) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1)
      monthKeys.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`)
    }

    // ── 2. Load users (active reps) ────────────────────────────────────────
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { NOT: { email: { contains: "dummy.titandiamond.com" } } },
          { NOT: { email: { contains: "example.com" } } },
          { NOT: { name: { contains: "test_migration" } } }
        ],
        ...(repFilter ? { id: repFilter } : {})
      },
      select: {
        id: true, name: true, email: true,
        constantVigEnabled: true, constantVigValue: true,
        monthlyVigGoals: {
          where: { monthKey: { in: monthKeys } },
          select: { monthKey: true, metric: true, profitGoal: true, subtotalGoal: true, workingDays: true, manualVigRate: true, lastSyncedVigRate: true }
        }
      }
    })

    // ── 3a. Load company holidays from SystemSetting (same key as /admin/holidays page) ──
    // Stored as JSON array of { date: 'YYYY-MM-DD', name: string }
    const holidaySetting = await prisma.systemSetting.findUnique({ where: { key: 'holidays' } }).catch(() => null)
    const rawHolidays: { date: string; name?: string }[] = holidaySetting ? JSON.parse(holidaySetting.value) : []
    const companyHolidays = new Set<string>(rawHolidays.map(h => h.date))

    // ── 3c. Load rep daily target settings (used to seed new months) ──
    const [salesTargetSetting, subtotalTargetSetting] = await Promise.all([
      prisma.systemSetting.findUnique({ where: { key: 'sales_targets' } }).catch(() => null),
      prisma.systemSetting.findUnique({ where: { key: 'subtotal_targets' } }).catch(() => null)
    ])
    const dailyProfitTargets: Record<string, number> = salesTargetSetting ? JSON.parse(salesTargetSetting.value) : {}
    const dailySubtotalTargets: Record<string, number> = subtotalTargetSetting ? JSON.parse(subtotalTargetSetting.value) : {}

    // ── 3b. Helper: count weekdays in a month minus company holidays ────────
    function calcWorkingDays(monthKey: string): number {
      const [yyyy, mm] = monthKey.split('-').map(Number)
      const daysInMonth = new Date(yyyy, mm, 0).getDate()  // last day of month
      let count = 0
      for (let d = 1; d <= daysInMonth; d++) {
        const date = new Date(yyyy, mm - 1, d)
        const dow  = date.getDay() // 0=Sun, 6=Sat
        if (dow === 0 || dow === 6) continue // skip weekends
        const iso = `${yyyy}-${String(mm).padStart(2,'0')}-${String(d).padStart(2,'0')}`
        if (companyHolidays.has(iso)) continue // skip holidays
        count++
      }
      return count
    }

    // ── 3. Build name → userId map for invoice resolution ─────────────────
    const nameToId: Record<string, string> = {}
    const aliases: [string, string][] = [
      ["ricky griffin", "richard griffin"], ["ricky griffin ", "richard griffin"],
      ["monty morgan", "montgomery morgan"], ["ben bequette", "benjamin bequette"],
      ["justin  zastrow", "justin zastrow"]
    ]
    users.forEach(u => {
      if (u.name) nameToId[u.name.replace(/\s+/g, ' ').trim().toLowerCase()] = u.id
    })
    aliases.forEach(([alias, target]) => {
      const u = users.find(u => u.name?.toLowerCase().includes(target))
      if (u) nameToId[alias] = u.id
    })

    // ── 4. Fetch invoices in the window ───────────────────────────────────
    const windowStart = new Date(now.getFullYear(), now.getMonth() - (months - 1), 1)
    const invoices = await prisma.invoice.findMany({
      where: {
        issueDate: { gte: windowStart },
        NOT: { status: { in: ['Void', 'Draft'] } }
      },
      select: {
        id: true, zohoId: true, issueDate: true, amount: true,
        items: true,
        account: { select: { id: true, name: true, ownerId: true } }
      },
      orderBy: { issueDate: 'desc' }
    })

    // ── 5. Index goal data per user ───────────────────────────────────────
    const goalMap: Record<string, Record<string, any>> = {}  // userId → monthKey → goal
    users.forEach(u => {
      goalMap[u.id] = {}
      u.monthlyVigGoals.forEach((g: any) => { goalMap[u.id][g.monthKey] = g })
    })

    // ── 6. Aggregate invoice actuals + collect mismatches ──────────────────
    type MonthStats = {
      subtotal: number; deadCost: number; deadProfit: number; invoiceCount: number
      mismatches: { id: string; zohoId: string; number: string; date: string; amount: number; actualVig: number; expectedVig: number; customer: string }[]
    }
    const statsMap: Record<string, Record<string, MonthStats>> = {} // monthKey → userId → stats

    invoices.forEach((inv: any) => {
      const items = (inv.items as any) || {}
      const issueDate = inv.issueDate ? new Date(inv.issueDate) : null
      if (!issueDate) return
      const mk = `${issueDate.getFullYear()}-${String(issueDate.getMonth() + 1).padStart(2, '0')}`
      if (!monthKeys.includes(mk)) return

      const salespersonName = (items.salesperson || '').replace(/\s+/g, ' ').trim().toLowerCase()
      const userId = nameToId[salespersonName] || inv.account?.ownerId || null
      if (!userId) return

      // Resolve what vig rate SHOULD be for this rep/month
      const user = users.find(u => u.id === userId)
      if (!user) return

      const goal = goalMap[userId]?.[mk]
      const expectedVig: number = user.constantVigEnabled
        ? parseFloat(String(user.constantVigValue)) || 1.3
        : (goal?.manualVigRate ?? goal?.lastSyncedVigRate ?? 1.3)

      // What VIG is actually stored on the invoice?
      const rawVig = items.cf_salesperson_vig ?? items.cf_salesperson_vig_unformatted ?? items.vigRate ?? null
      const actualVig = rawVig !== null && rawVig !== undefined && rawVig !== '' ? parseFloat(rawVig) : null

      const subtotal    = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount) || 0
      const deadCost    = parseFloat(items.deadCostTotal || items.dead_cost_total || 0) || 0
      const additional  = parseFloat(items.additionalCosts || 0) || 0
      const ccFees      = parseFloat(items.ccFees || 0) || 0
      const deadProfit  = subtotal - deadCost - additional - ccFees

      if (!statsMap[mk]) statsMap[mk] = {}
      if (!statsMap[mk][userId]) statsMap[mk][userId] = { subtotal: 0, deadCost: 0, deadProfit: 0, invoiceCount: 0, mismatches: [] }

      statsMap[mk][userId].subtotal   += subtotal
      statsMap[mk][userId].deadCost   += deadCost
      statsMap[mk][userId].deadProfit += deadProfit
      statsMap[mk][userId].invoiceCount++

      // Flag as mismatch only if VIG IS stored and differs from expected
      // (skip invoices where VIG was never written — they haven't been cost-processed yet)
      if (includeMismatches && actualVig !== null && !isNaN(actualVig) && actualVig > 0 && Math.abs(actualVig - expectedVig) > 0.01) {
        const invNum = items.invoice_number || items.invoiceNumber || inv.zohoId || inv.id
        statsMap[mk][userId].mismatches.push({
          id:       inv.id,
          zohoId:   inv.zohoId || '',
          number:   invNum,
          date:     issueDate.toISOString().split('T')[0],
          amount:   subtotal,
          actualVig,
          expectedVig,
          customer: inv.account?.name || 'Unknown'
        })
      }
    })

    // ── 7. Build response ─────────────────────────────────────────────────
    const result = monthKeys.map(mk => {
      const [yyyy, mm] = mk.split('-').map(Number)
      const reps: Record<string, any> = {}

      users.forEach(u => {
        const goal = goalMap[u.id]?.[mk]
        const stats = statsMap[mk]?.[u.id] || { subtotal: 0, deadCost: 0, deadProfit: 0, invoiceCount: 0, mismatches: [] }
        const manualVigRate   = goal?.manualVigRate   ?? null
        const lastSyncedVigRate = goal?.lastSyncedVigRate ?? null
        const vigRate: number = u.constantVigEnabled
          ? parseFloat(String(u.constantVigValue)) || 1.3
          : (manualVigRate ?? lastSyncedVigRate ?? 1.3)

        // Human-readable explanation of why the VIG rate is what it is
        let vigReason: string
        if (u.constantVigEnabled) {
          vigReason = `Constant override — always ${vigRate.toFixed(2)}x for this rep`
        } else if (manualVigRate !== null) {
          vigReason = `Manually set to ${vigRate.toFixed(2)}x for this month`
        } else if (lastSyncedVigRate !== null) {
          vigReason = `Synced from Zoho Books goal (${vigRate.toFixed(2)}x)`
        } else {
          vigReason = `System default (no goal set for this month)`
        }

        // Working days: stored override → computed (weekdays - holidays)
        const storedWorkingDays = goal?.workingDays ?? null
        const computedWorkingDays = calcWorkingDays(mk)
        const workingDays = storedWorkingDays ?? computedWorkingDays

        // Seed defaults from rep daily rates when no stored goal exists
        const repDailyProfit = dailyProfitTargets[u.id] || 0
        const repDailySub = dailySubtotalTargets[u.id] || 0
        const defaultProfitGoal = repDailyProfit > 0 ? Math.round(repDailyProfit * workingDays) : 20000
        const defaultSubtotalGoal = repDailySub > 0 ? Math.round(repDailySub * workingDays) : 40000

        const isProfit   = (goal?.metric ?? 'PROFIT') !== 'SUBTOTAL'
        const profitGoal = goal?.profitGoal ?? defaultProfitGoal
        const subtotalGoal = goal?.subtotalGoal ?? defaultSubtotalGoal
        const goalValue  = isProfit ? profitGoal : subtotalGoal
        const dailyGoal  = workingDays > 0 ? Math.round(goalValue / workingDays) : 0

        reps[u.id] = {
          vigRate, manualVigRate, lastSyncedVigRate, vigReason,
          metric:            goal?.metric       ?? 'PROFIT',
          profitGoal,
          subtotalGoal,
          workingDays,
          computedWorkingDays,
          storedWorkingDays,
          dailyGoal,
          subtotal:          stats.subtotal,
          deadCost:          stats.deadCost,
          deadProfit:        stats.deadProfit,
          invoiceCount:      stats.invoiceCount,
          metGoal:           (goal?.metric === 'SUBTOTAL')
            ? stats.subtotal  >= subtotalGoal
            : stats.deadProfit >= profitGoal,
          mismatches:        stats.mismatches
        }
      })

      return {
        monthKey:  mk,
        monthName: `${MONTH_NAMES[mm - 1]} ${yyyy}`,
        reps
      }
    })

    // ── 8. Build repList for the UI (id + name) ───────────────────────────
    const repList = users.map(u => ({
      id: u.id, name: u.name, email: u.email,
      constantVigEnabled: u.constantVigEnabled,
      constantVigValue:   u.constantVigValue
    }))

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        success: true,
        months: result,
        reps: repList,
        holidays: rawHolidays.sort((a, b) => a.date.localeCompare(b.date)),
        holidayCount: rawHolidays.length
      })
    }

  } catch (err: any) {
    console.error("[vig-history] Error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler, { requireAdmin: true })
