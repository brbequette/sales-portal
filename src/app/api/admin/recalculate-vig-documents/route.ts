import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { calculateDocumentCosts } from "../../../../../netlify/functions/lib/cost-calculations"

function formatMonthKey(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  return `${y}-${m}`
}

export async function POST(req: Request) {
  try {
    const { repId, monthKey, applyToAll } = await req.json().catch(() => ({}))

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
      const repNameLower = user.name?.toLowerCase().trim() || ""

      // Fetch all invoices for this rep
      const allInvoices = await prisma.invoice.findMany({
        include: { account: { select: { id: true, ownerId: true } } },
        orderBy: { issueDate: 'asc' }
      })

      const repInvoices = allInvoices.filter(inv => {
        const items = (inv.items as any) || {}
        const salesperson = (items.salesperson || "").toLowerCase().trim()
        return salesperson.includes(repNameLower) || repNameLower.includes(salesperson) || inv.account?.ownerId === user.id
      })

      if (repInvoices.length === 0) continue

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

        for (const inv of invoicesInMonth) {
          const items = (inv.items as any) || {}
          
          // Override vigRate in payload for calculation
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

          await prisma.invoice.update({
            where: { id: inv.id },
            data: { items: updatedItems }
          })

          if (inv.status !== 'Void' && inv.status !== 'Draft') {
            monthlyTotalProfit += calcResult.profit
            monthlyTotalSubtotal += calcResult.subTotal
          }

          totalInvoicesUpdated++
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
