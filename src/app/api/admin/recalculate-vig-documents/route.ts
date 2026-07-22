import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getSystemSettings } from '@/lib/settings'
import { calculateDocumentCosts } from '../../../../../netlify/functions/lib/cost-calculations'

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => ({}))
    const { repId, monthKey, applyToAll } = body

    const settings = await getSystemSettings()
    
    // Find target rep user if specified
    let targetRepNames: string[] = []
    if (repId && !applyToAll) {
      const user = await prisma.user.findUnique({ where: { id: repId } })
      if (user?.name) targetRepNames.push(user.name.toLowerCase().trim())
    }

    // Fetch invoices to recalculate
    const invoices = await prisma.invoice.findMany()

    let updatedCount = 0

    for (const inv of invoices) {
      const items = (inv.items as any) || {}
      const salesperson = (items.salesperson || "").toLowerCase().trim()
      const docDate = inv.issueDate ? new Date(inv.issueDate) : (items.date ? new Date(items.date) : new Date(inv.createdAt))
      const docMonthKey = docDate ? docDate.toISOString().substring(0, 7) : ""

      // Filter by rep if specified
      if (targetRepNames.length > 0) {
        const matchesRep = targetRepNames.some(name => salesperson.includes(name) || name.includes(salesperson))
        if (!matchesRep) continue
      }

      // Filter by monthKey if specified
      if (monthKey && docMonthKey && docMonthKey !== monthKey) {
        continue
      }

      // Recalculate document costs using historical VIG rules
      const calcResult = await calculateDocumentCosts(items)

      // Update items JSON payload with recalculated VIG values
      const updatedItems = {
        ...items,
        vigRate: calcResult.vigRate,
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

      updatedCount++
    }

    return NextResponse.json({
      success: true,
      updatedCount,
      message: `Successfully recalculated and updated ${updatedCount} document(s) with new VIG rates!`
    })
  } catch (error: any) {
    console.error('Recalculate VIG Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
