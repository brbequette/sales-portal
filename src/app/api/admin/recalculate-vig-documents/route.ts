import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSystemSettings } from '@/lib/settings'
import { calculateDocumentCosts } from '../../../../../netlify/functions/lib/cost-calculations'

function formatMonthKey(d: Date): string {
  const yyyy = d.getFullYear()
  const mm = String(d.getMonth() + 1).padStart(2, '0')
  return `${yyyy}-${mm}`
}

function getNextMonthKey(monthKey: string): string {
  const [yyyy, mm] = monthKey.split('-').map(Number)
  const nextDate = new Date(yyyy, mm, 1) // month is 0-indexed in JS, so `mm` gives next month
  return formatMonthKey(nextDate)
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { repId, monthKey, applyToAll } = body

    const settings = await getSystemSettings()
    
    // Find target rep users
    let targetUsers = await prisma.user.findMany({
      where: repId && !applyToAll ? { id: repId } : {}
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

        // If constant VIG enabled for rep, use constant rate
        let effectiveVigRate = user.constantVigEnabled && user.constantVigValue
          ? user.constantVigValue
          : (previousMonthMetGoal ? 1.3 : 1.5)

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
        // Monthly subtotal target fallback: $30,000 profit or $60,000 subtotal
        const monthlyProfitGoal = 30000
        previousMonthMetGoal = (monthlyTotalProfit >= monthlyProfitGoal) || (monthlyTotalSubtotal >= 60000)
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
