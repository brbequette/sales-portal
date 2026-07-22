import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Statuses where the FINAL half is earned (invoice has been paid)
const FINAL_PAID_STATUSES = new Set(['Paid', 'paid', 'Closed', 'closed', 'Fulfilled', 'fulfilled'])
// Statuses where at least the UPFRONT half is earned (invoice created/open)
const SKIP_STATUSES = new Set(['Void', 'void', 'Draft', 'draft'])

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  try {
    const { repId, year, includeHidden } = event.queryStringParameters || {}
    const showHidden = includeHidden === 'true'

    // Default to current year
    const targetYear = year || new Date().getFullYear().toString()
    let dateFilter = {}
    if (targetYear !== "all") {
      const start = new Date(`${targetYear}-01-01`)
      const end = new Date(`${parseInt(targetYear) + 1}-01-01`)
      dateFilter = { gte: start, lt: end }
    }

    // --- Commission source: ALL invoices except Void/Draft ---
    // Upfront half earned on creation, final half earned on payment
    const rawInvoices = await prisma.invoice.findMany({
      where: {
        ...(targetYear !== "all" && { issueDate: dateFilter }),
        status: { notIn: Array.from(SKIP_STATUSES) }
      },
      select: {
        id: true,
        zohoId: true,
        amount: true,
        status: true,
        issueDate: true,
        items: true,
        account: { select: { name: true, zohoId: true } }
      },
      orderBy: { issueDate: "desc" }
    })

    // Deduplicate by invoiceNumber — same invoice can be synced from both Zoho CRM and Zoho Books.
    // Prefer the record with the highest profit (real profit data beats zero-profit Books record).
    // Fall back to highest amount if profit is equal.
    const seenInvoiceNumbers = new Map<string, typeof rawInvoices[0]>()
    const invoicesWithoutNumber: typeof rawInvoices = []
    
    for (const inv of rawInvoices) {
      const num = (inv.items as any)?.invoiceNumber
      if (!num) {
        invoicesWithoutNumber.push(inv)
        continue
      }
      
      const existing = seenInvoiceNumbers.get(num)
      if (!existing) {
        seenInvoiceNumbers.set(num, inv)
      } else {
        const invProfit = parseFloat((inv.items as any)?.profit || 0)
        const existProfit = parseFloat((existing.items as any)?.profit || 0)
        // Prefer higher profit; if equal prefer higher amount
        const isBetter = invProfit > existProfit || (invProfit === existProfit && (inv.amount || 0) > (existing.amount || 0))
        if (isBetter) {
          seenInvoiceNumbers.set(num, inv)
        }
      }
    }
    
    const invoices = [...Array.from(seenInvoiceNumbers.values()), ...invoicesWithoutNumber]

    // Fetch Sales Orders to include Sales Order based commission records
    const rawSalesOrders = await prisma.salesOrder.findMany({
      where: {
        ...(targetYear !== "all" ? { orderDate: dateFilter } : {}),
        status: { notIn: ['Void', 'void', 'Draft', 'draft', 'Cancelled', 'cancelled'] }
      },
      select: {
        id: true,
        zohoId: true,
        amount: true,
        status: true,
        orderDate: true,
        items: true,
        account: { select: { name: true, zohoId: true } }
      },
      orderBy: { orderDate: "desc" }
    })

    // --- Pipeline source: DEALS only (estimates/SOs for activity metrics) ---
    const deals = await prisma.deal.findMany({
      where: targetYear !== "all" ? {
        OR: [
          { closingDate: dateFilter },
          { AND: [{ closingDate: null }, { createdAt: dateFilter }] }
        ]
      } : undefined,
      select: {
        id: true, zohoId: true, name: true, stage: true, amount: true,
        closingDate: true, createdAt: true, ownerId: true,
        owner: { select: { id: true, name: true } },
        account: { select: { name: true, zohoId: true } }
      },
      orderBy: { closingDate: "desc" }
    })

    // Get all reps
    let users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" }
    })

    const visibleRepsSetting = await prisma.systemSetting.findUnique({ where: { key: "visible_reps" } })
    const visibleReps: string[] = JSON.parse(visibleRepsSetting?.value || "[]")
    
    const collectionsManagerSetting = await prisma.systemSetting.findUnique({ where: { key: "collections_manager_id" } })
    const collectionsManagerId = collectionsManagerSetting?.value || null

    if (!showHidden && !repId && visibleReps.length > 0) {
      users = users.filter(u => visibleReps.includes(u.id))
    }

    // Fetch payouts — scoped to the target year if specified, or all payouts if 'all'
    let payoutWhere: any = repId ? { repId } : {}
    if (targetYear && targetYear !== 'all' && !isNaN(parseInt(targetYear))) {
      const payoutStart = new Date(`${targetYear}-01-01`)
      const payoutEnd = new Date(`${parseInt(targetYear) + 1}-01-01`)
      payoutWhere.date = { gte: payoutStart, lt: payoutEnd }
    }
    const payouts = await prisma.payout.findMany({
      where: payoutWhere,
      orderBy: { date: "desc" }
    })

    const userByName = new Map(users.map(u => [u.name?.toLowerCase().trim(), u]))

    // ── Build invoice-based commission records ──────────────────────────
    // Commission is split 50/50:
    //   - Upfront (25% of profit): earned when invoice is created, appears in that week's ledger
    //   - Final  (25% of profit): earned when invoice is paid, appears in the following week's pay
    //
    // Rep attribution: items.salesperson on the document — the rep who drove the sale.
    // Account owner is a CRM assignment only and does NOT drive commissions.
    const invoiceRecords = invoices.map(inv => {
      const items = inv.items as any || {}
      const cfs = items.custom_fields || []
      const salespersonName = items.salesperson as string | null
      const subTotal = parseFloat(items.sub_total || items.subTotal) || inv.amount || 0
      const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

      let deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || 0)
      if (deadCost === 0 && lineItems.length > 0) {
        deadCost = lineItems.reduce((sum: number, li: any) => {
          const qty = parseFloat(li.quantity) || 1
          const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
          return sum + (qty * cost)
        }, 0)
      }

      const docDate = inv.issueDate ? new Date(inv.issueDate) : new Date()
      const year = docDate.getFullYear()
      const isMontgomery = salespersonName?.toLowerCase().includes("montgomery") || salespersonName?.toLowerCase().includes("morgan")
      
      // Historical VIG Rate Rules:
      // - Up to end of 2024: Monty = 1.0, Everyone else = 1.3
      // - 2025 onwards: Monty = 1.0, Everyone else = 1.3 baseline (or items.vigRate / 1.5 penalty)
      const vigRate = (year <= 2024 || isMontgomery) ? (isMontgomery ? 1.0 : 1.3) : parseFloat(items.vigRate || 1.3)
      const deadCostPlusVig = deadCost * vigRate

      const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find((c: any) => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0)
      const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find((c: any) => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0)
      
      // 1. Initial Estimated Profit before end-of-deal CC fees (for Upfront 1st Payment)
      const initialProfit = subTotal - deadCostPlusVig - additionalCosts

      // 2. Final Net Profit after VIG, end CC fees & all final costs are in
      const profit = subTotal - deadCostPlusVig - additionalCosts - ccFees

      // Dead Profit is raw profit for Sales Goals (Subtotal - Dead Cost Total - Additional Costs - CC Fees)
      const deadProfit = subTotal - deadCost - additionalCosts - ccFees

      const matchedRep = salespersonName ? userByName.get(salespersonName.toLowerCase().trim()) : null
      const isPaid = FINAL_PAID_STATUSES.has(inv.status)

      // 3. Two-Stage 50/50 Commission Payout & 50/50 Negative Profit Loss Sharing:
      // - Positive Profit: Rep earns 50% of After-VIG profit (25% upfront on creation + 25% final when paid)
      // - Negative Profit (Loss): Rep & Company split loss 50/50 (25% upfront deduction on creation + 25% final deduction when paid)
      const upfront = initialProfit * 0.25
      const finalTotalTarget = profit * 0.50

      const final  = isPaid ? (finalTotalTarget - upfront) : 0
      const future = !isPaid ? (finalTotalTarget - upfront) : 0
      const total  = upfront + final

      const invoiceNumber = items.invoiceNumber || items.invoice_number || null
      const paymentDate = items.paymentDate || null

      const daysOld = inv.issueDate ? (Date.now() - inv.issueDate.getTime()) / (1000 * 60 * 60 * 24) : 0
      const isAtRisk = !isPaid && daysOld >= 120
      const atRiskAmount = isAtRisk ? (upfront + future) : 0

      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoiceNumber,
        name: invoiceNumber ? `${inv.account?.name || 'Unknown'} | INV-${invoiceNumber}` : (inv.account?.name || 'Unknown'),
        amount: parseFloat(items.sub_total) || inv.amount || 0,
        profit,
        deadCost,
        status: inv.status,
        isPaid,
        daysOld,
        isAtRisk,
        issueDate: inv.issueDate,
        paymentDate,
        repId: matchedRep?.id || salespersonName?.toLowerCase().trim() || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: inv.account?.name || "Unknown",
        accountZohoId: inv.account?.zohoId || null,
        commission: { total, upfront, final, future, atRiskAmount },
        type: "invoice" as const
      }
    })

    const seenSoIds = new Set(invoiceRecords.map(i => i.zohoId).filter(Boolean))

    const salesOrderRecords = rawSalesOrders.map(so => {
      const items = (so.items as any) || {}
      const cfs = items.custom_fields || []
      const salespersonName = items.salesperson as string | null
      const subTotal = parseFloat(items.sub_total || items.subTotal) || so.amount || 0
      const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

      let deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || 0)
      if (deadCost === 0 && lineItems.length > 0) {
        deadCost = lineItems.reduce((sum: number, li: any) => {
          const qty = parseFloat(li.quantity) || 1
          const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
          return sum + (qty * cost)
        }, 0)
      }

      const docDate = so.orderDate ? new Date(so.orderDate) : new Date()
      const year = docDate.getFullYear()
      const isMontgomery = salespersonName?.toLowerCase().includes("montgomery") || salespersonName?.toLowerCase().includes("morgan")
      
      const vigRate = (year <= 2024 || isMontgomery) ? (isMontgomery ? 1.0 : 1.3) : parseFloat(items.vigRate || 1.3)
      const deadCostPlusVig = deadCost * vigRate

      const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find((c: any) => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0)
      const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find((c: any) => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0)
      
      const initialProfit = subTotal - deadCostPlusVig - additionalCosts
      const profit = subTotal - deadCostPlusVig - additionalCosts - ccFees

      const matchedRep = salespersonName ? userByName.get(salespersonName.toLowerCase().trim()) : null
      const isPaid = FINAL_PAID_STATUSES.has((so.status || '').toLowerCase())

      const upfront = initialProfit * 0.25
      const finalTotalTarget = profit * 0.50

      const final  = isPaid ? (finalTotalTarget - upfront) : 0
      const future = !isPaid ? (finalTotalTarget - upfront) : 0
      const total  = upfront + final

      const soNumber = items.salesorder_number || items.salesorderNumber || so.zohoId || null

      return {
        id: so.id,
        zohoId: so.zohoId,
        invoiceNumber: soNumber ? `SO-${soNumber}` : null,
        name: soNumber ? `${so.account?.name || 'Unknown'} | SO-${soNumber}` : (so.account?.name || 'Unknown'),
        amount: parseFloat(items.sub_total) || so.amount || 0,
        profit,
        deadCost,
        status: so.status || 'Pending',
        isPaid,
        daysOld: so.orderDate ? (Date.now() - so.orderDate.getTime()) / (1000 * 60 * 60 * 24) : 0,
        isAtRisk: false,
        issueDate: so.orderDate,
        paymentDate: null,
        repId: matchedRep?.id || salespersonName?.toLowerCase().trim() || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: so.account?.name || "Unknown",
        accountZohoId: so.account?.zohoId || null,
        commission: { total, upfront, final, future, atRiskAmount: 0 },
        type: "invoice" as const
      }
    }).filter(so => !so.zohoId || !seenSoIds.has(so.zohoId))

    const allCommissionRecords = [...invoiceRecords, ...salesOrderRecords]

    // ── Build deal pipeline records (activity only, no commission) ───────
    const dealRecords = deals.map(deal => {
      const stage = (deal.stage || "").toLowerCase()
      const isClosed = stage.includes("closed won") || stage.includes("fulfilled")
      const isLost = stage.includes("closed lost")

      return {
        id: deal.id,
        zohoId: deal.zohoId,
        name: deal.name,
        stage: deal.stage,
        amount: deal.amount || 0,
        closeDate: deal.closingDate || deal.createdAt,
        repId: deal.ownerId || "unassigned",
        repName: deal.owner?.name || "Unassigned",
        accountName: deal.account?.name || "Unknown",
        accountZohoId: deal.account?.zohoId || null,
        status: isLost ? "lost" : isClosed ? "fulfilled" : "pending",
        type: "deal" as const
      }
    })

    // ── Group invoice & sales order commissions by rep ───────────────────
    const byRep: Record<string, any> = {}

    for (const inv of allCommissionRecords) {
      const key = inv.repId
      if (!byRep[key]) {
        byRep[key] = {
          repId: inv.repId,
          repName: inv.repName,
          invoices: [],
          deals: [],
          payouts: [],
          totalEarned: 0,
          totalPaid: 0,
          totalProfit: 0,
          totalSales: 0,
          totalFutures: 0,
          totalAtRisk: 0,
          balance: 0,
        }
      }
      byRep[key].invoices.push(inv)
      byRep[key].totalEarned += inv.commission.total   // upfront + final (if paid)
      byRep[key].totalProfit += inv.profit
      byRep[key].totalSales  += inv.amount
      byRep[key].totalFutures += inv.commission.future
      byRep[key].totalAtRisk += inv.commission.atRiskAmount
    }

    // Attach deal pipeline activity to reps (for display only)
    for (const deal of dealRecords) {
      const key = deal.repId
      if (!byRep[key]) {
        byRep[key] = {
          repId: deal.repId, repName: deal.repName,
          invoices: [], deals: [], payouts: [],
          totalEarned: 0, totalPaid: 0, totalProfit: 0, totalSales: 0, totalFutures: 0, totalAtRisk: 0, balance: 0
        }
      }
      byRep[key].deals.push(deal)
    }

    // Add payouts and calculate balances
    for (const payout of payouts) {
      if (byRep[payout.repId]) {
        byRep[payout.repId].payouts.push(payout)
        byRep[payout.repId].totalPaid += payout.amount
      }
    }

    // ── Collections Manager Bonus ────────────────────────────────────────
    if (collectionsManagerId && byRep[collectionsManagerId]) {
      // Group all paid invoices by week to calculate the bonus
      const weeklyTotals: Record<string, number> = {}
      for (const inv of invoiceRecords) {
        if (inv.isPaid) {
          const date = inv.paymentDate || inv.issueDate
          if (date) {
            const d = new Date(date)
            const day = d.getDay()
            const diff = d.getDate() - day + (day === 0 ? -6 : 1)
            const weekStart = new Date(d)
            weekStart.setDate(diff)
            weekStart.setHours(0, 0, 0, 0)
            const startStr = weekStart.toISOString().split('T')[0]
            
            // Only apply to weeks starting after June 8th 2026
            if (startStr >= '2026-06-08') {
              weeklyTotals[startStr] = (weeklyTotals[startStr] || 0) + inv.amount
            }
          }
        }
      }

      for (const [weekStartStr, totalAmount] of Object.entries(weeklyTotals)) {
        let bonusRate = 0
        if (totalAmount >= 50000) bonusRate = 0.01
        else if (totalAmount >= 37500) bonusRate = 0.0075
        else if (totalAmount >= 25000) bonusRate = 0.005

        if (bonusRate > 0) {
          const bonusAmount = totalAmount * bonusRate
          const managerName = byRep[collectionsManagerId].repName
          
          const bonusRecord = {
            id: `bonus-${weekStartStr}`,
            zohoId: null,
            invoiceNumber: "Bonus",
            name: `Collections Bonus: ${weekStartStr}`,
            amount: totalAmount,
            profit: bonusAmount, // To show it clearly on UI if profit is shown
            deadCost: 0,
            status: "Paid",
            isPaid: true,
            daysOld: 0,
            isAtRisk: false,
            issueDate: new Date(weekStartStr),
            paymentDate: new Date(weekStartStr),
            repId: collectionsManagerId,
            repName: managerName,
            accountName: "Weekly Collections Bonus",
            accountZohoId: null,
            commission: { total: bonusAmount, upfront: 0, final: bonusAmount, future: 0, atRiskAmount: 0 },
            type: "invoice" as const
          }
          
          byRep[collectionsManagerId].invoices.push(bonusRecord)
          byRep[collectionsManagerId].totalEarned += bonusAmount
        }
      }
    }

    Object.values(byRep).forEach((rep: any) => {
      rep.balance = rep.totalEarned - rep.totalPaid
    })

    // ── Get available years from invoices ────────────────────────────────
    const yearRows = await prisma.$queryRaw<{ y: number }[]>`
      SELECT DISTINCT y FROM (
        SELECT EXTRACT(YEAR FROM "issueDate")::int AS y FROM "Invoice"
          WHERE "issueDate" IS NOT NULL AND status NOT IN ('Void','void','Draft','draft')
        UNION
        SELECT EXTRACT(YEAR FROM "closingDate")::int AS y FROM "Deal" WHERE "closingDate" IS NOT NULL
        UNION
        SELECT EXTRACT(YEAR FROM "createdAt")::int AS y FROM "Deal" WHERE "closingDate" IS NULL
      ) t WHERE y IS NOT NULL ORDER BY y DESC
    `
    const years = yearRows.map(r => r.y)

    // ── Apply repId filter ───────────────────────────────────────────────
    let finalByRep = byRep
    if (repId) {
      finalByRep = {}
      if (byRep[repId]) finalByRep[repId] = byRep[repId]
    }

    // Only include actual system users
    const validUserIds = new Set(users.map((u: any) => u.id))
    for (const key in finalByRep) {
      if (!validUserIds.has(key)) {
        delete finalByRep[key]
      }
    }

    const allInvoices = repId
      ? allCommissionRecords.filter(i => i.repId === repId)
      : allCommissionRecords

    // ── Stats ────────────────────────────────────────────────────────────
    const stats = {
      totalInvoices: allInvoices.length,
      totalRevenue: allInvoices.reduce((s, i) => s + i.amount, 0),
      totalProfit: allInvoices.reduce((s, i) => s + i.profit, 0),
      totalCommissions: allInvoices.reduce((s, i) => s + i.commission.total, 0),
      totalDealsInPipeline: dealRecords.length,
      totalPipelineValue: dealRecords.reduce((s, d) => s + d.amount, 0),
    }

    const responseBody = JSON.stringify({
      success: true,
      year: targetYear,
      invoices: allInvoices,
      deals: dealRecords,
      byRep: finalByRep,
      users,
      years,
      stats,
    })

    // Safety valve
    if (responseBody.length > 5 * 1024 * 1024) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          success: true, year: targetYear, invoices: [], deals: [],
          byRep: finalByRep, users, years, stats, truncated: true
        })
      }
    }

    return { statusCode: 200, headers: cors, body: responseBody }
  } catch (err: any) {
    console.error("get-commissions error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
