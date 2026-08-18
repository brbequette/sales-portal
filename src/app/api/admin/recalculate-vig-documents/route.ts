import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { calculateDocumentCosts } from "../../../../../netlify/functions/lib/cost-calculations"

function formatMonthKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

function monthKeyToDateRange(mk: string): { gte: Date; lte: Date } {
  const [yyyy, mm] = mk.split('-').map(Number)
  return {
    gte: new Date(yyyy, mm - 1, 1),
    lte: new Date(yyyy, mm, 0, 23, 59, 59)
  }
}

export async function POST(req: Request) {
  try {
    const { repId, monthKey, applyToAll, invoiceIds, newVigRate } = await req.json().catch(() => ({}))

    // Fetch target user(s)
    let targetUsers: any[] = []
    if (repId && !applyToAll) {
      const u = await prisma.user.findUnique({ where: { id: repId } })
      if (u) targetUsers = [u]
    } else {
      targetUsers = await prisma.user.findMany()
    }

    if (targetUsers.length === 0) {
      return NextResponse.json({ success: false, error: "No users found for VIG recalculation" }, { status: 404 })
    }

    // Fetch all monthly VIG goals from DB (saved on VIG Management page)
    const allMonthlyGoals = await prisma.monthlyVigGoal.findMany()
    const goalMap = new Map<string, Map<string, any>>()
    allMonthlyGoals.forEach(g => {
      if (!goalMap.has(g.repId)) goalMap.set(g.repId, new Map())
      goalMap.get(g.repId)!.set(g.monthKey, g)
    })

    let totalInvoicesUpdated = 0
    let cascadedMonthsCount = 0

    for (const user of targetUsers) {
      const repNameLower = (user.name || '').toLowerCase().trim()

      // PERF FIX: scope at DB level — only load invoices for this rep.
      // If specific invoiceIds are passed, filter to those directly.
      // If monthKey is provided, restrict to that month's date range.
      const dateFilter = invoiceIds?.length
        ? undefined  // exact IDs supplied — no date filter needed
        : monthKey
          ? monthKeyToDateRange(monthKey)
          : undefined  // applyToAll: no date restriction

      const repInvoices = await prisma.invoice.findMany({
        where: {
          ...(invoiceIds?.length ? { id: { in: invoiceIds } } : {
            OR: [
              { account: { ownerId: user.id } },
              { items: { path: ['salesperson'], string_contains: user.name || '' } }
            ],
            ...(dateFilter ? { issueDate: dateFilter } : {})
          }),
          NOT: { status: { in: ['Void', 'Draft'] } }
        },
        include: { account: { select: { id: true, ownerId: true } } },
        orderBy: { issueDate: 'asc' }
      })

      // If newVigRate is explicitly passed (from fix-vig-rate), skip cascading logic
      if (newVigRate != null && !isNaN(parseFloat(newVigRate))) {
        const rate = parseFloat(newVigRate)
        // Batch update all supplied invoices to the specified rate
        const updates = repInvoices.map(async (inv: any) => {
          const items = (inv.items as any) || {}
          const itemsForCalc = { ...items, cf_salesperson_vig: rate }
          const calcResult = await calculateDocumentCosts(itemsForCalc)
          const updatedItems = {
            ...items,
            vigRate: rate, cf_salesperson_vig: rate,
            deadCostTotal: calcResult.deadCostTotal,
            deadCostPlusVig: calcResult.deadCostPlusVig,
            deadProfit: calcResult.deadProfitActual,
            profit: calcResult.profit,
            salesCommission: calcResult.salesCommission
          }
          totalInvoicesUpdated++
          return prisma.invoice.update({ where: { id: inv.id }, data: { items: updatedItems } })
        })
        // Batch in chunks of 20 to avoid DB connection saturation
        for (let i = 0; i < updates.length; i += 20) {
          await Promise.all(updates.slice(i, i + 20))
        }
        cascadedMonthsCount++
        continue
      }

      // Group invoices by monthKey (YYYY-MM)
      const monthlyInvoicesMap: Record<string, any[]> = {}
      repInvoices.forEach(inv => {
        const d = inv.issueDate ? new Date(inv.issueDate) : new Date(inv.createdAt)
        const mk = formatMonthKey(d)
        if (!monthlyInvoicesMap[mk]) monthlyInvoicesMap[mk] = []
        monthlyInvoicesMap[mk].push(inv)
      })

      // Determine starting month key
      const sortedMonthKeys = Object.keys(monthlyInvoicesMap).sort()
      if (sortedMonthKeys.length === 0) continue

      let startIdx = 0
      if (monthKey && sortedMonthKeys.includes(monthKey)) {
        startIdx = sortedMonthKeys.indexOf(monthKey)
      }

      // Cascading Engine: Process from startIdx forward to current month
      let previousMonthMetGoal = true

      for (let i = startIdx; i < sortedMonthKeys.length; i++) {
        const currentMonthKey = sortedMonthKeys[i]
        const invoicesInMonth = monthlyInvoicesMap[currentMonthKey] || []

        const repGoals = goalMap.get(user.id)
        const currentGoalObj = repGoals?.get(currentMonthKey)

        // Resolve rate strictly from VIG Management page saved data:
        // 1. Constant VIG override on User record
        // 2. Manual VIG Rate override on MonthlyVigGoal
        // 3. Goal-based cascading baseline: 1.3 if met previous goal, 1.5 if missed
        let effectiveVigRate = 1.3
        if (user.constantVigEnabled && user.constantVigValue) {
          effectiveVigRate = user.constantVigValue
        } else if (currentGoalObj?.manualVigRate != null && !isNaN(currentGoalObj.manualVigRate)) {
          effectiveVigRate = currentGoalObj.manualVigRate
        } else {
          effectiveVigRate = previousMonthMetGoal ? 1.3 : 1.5
        }

        let monthlyTotalProfit = 0
        let monthlyTotalSubtotal = 0

        // PERF FIX: batch invoice recalcs with Promise.all in chunks of 20
        const batchUpdates = invoicesInMonth.map(async (inv: any) => {
          const items = (inv.items as any) || {}
          const itemsForCalc = { ...items, cf_salesperson_vig: effectiveVigRate }
          const calcResult = await calculateDocumentCosts(itemsForCalc)
          const updatedItems = {
            ...items,
            vigRate: effectiveVigRate,
            cf_salesperson_vig: effectiveVigRate,
            deadCostTotal: calcResult.deadCostTotal,
            deadCostPlusVig: calcResult.deadCostPlusVig,
            deadProfit: calcResult.deadProfitActual,
            profit: calcResult.profit,
            salesCommission: calcResult.salesCommission
          }
          if (inv.status !== 'Void' && inv.status !== 'Draft') {
            monthlyTotalProfit   += calcResult.profit
            monthlyTotalSubtotal += calcResult.subTotal
          }
          totalInvoicesUpdated++
          return prisma.invoice.update({ where: { id: inv.id }, data: { items: updatedItems } })
        })
        for (let bi = 0; bi < batchUpdates.length; bi += 20) {
          await Promise.all(batchUpdates.slice(bi, bi + 20))
        }

        // Determine if goal was met in currentMonthKey
        const targetProfitGoal = currentGoalObj?.profitGoal || 30000
        const targetSubtotalGoal = currentGoalObj?.subtotalGoal || 60000

        previousMonthMetGoal = (monthlyTotalProfit >= targetProfitGoal) || (monthlyTotalSubtotal >= targetSubtotalGoal)
        cascadedMonthsCount++
      }
    }

    return NextResponse.json({
      success: true,
      updatedCount: totalInvoicesUpdated,
      cascadedMonths: cascadedMonthsCount,
      message: `Cascading VIG Engine recalculated ${totalInvoicesUpdated} invoice(s) across ${cascadedMonthsCount} month(s) linked forward!`
    })

  } catch (error: any) {
    console.error('Recalculate Cascading VIG Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
