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
    const { repId, year } = event.queryStringParameters || {}

    // Default to current year
    const targetYear = year || new Date().getFullYear().toString()
    const start = new Date(`${targetYear}-01-01`)
    const end = new Date(`${parseInt(targetYear) + 1}-01-01`)

    // --- Commission source: ALL invoices except Void/Draft ---
    // Upfront half earned on creation, final half earned on payment
    const rawInvoices = await prisma.invoice.findMany({
      where: {
        issueDate: { gte: start, lt: end },
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
    const invoices = rawInvoices.filter(inv => {
      const num = (inv.items as any)?.invoiceNumber
      if (!num) return true // no invoice number — keep as-is
      const existing = seenInvoiceNumbers.get(num)
      if (!existing) {
        seenInvoiceNumbers.set(num, inv)
        return true
      }
      const invProfit = parseFloat((inv.items as any)?.profit || 0)
      const existProfit = parseFloat((existing.items as any)?.profit || 0)
      // Prefer higher profit; if equal prefer higher amount
      const isBetter = invProfit > existProfit || (invProfit === existProfit && (inv.amount || 0) > (existing.amount || 0))
      if (isBetter) {
        seenInvoiceNumbers.set(num, inv)
        return true
      }
      return false // worse or equal — skip
    })

    // --- Pipeline source: DEALS only (estimates/SOs for activity metrics) ---
    const deals = await prisma.deal.findMany({
      where: {
        OR: [
          { closingDate: { gte: start, lt: end } },
          { AND: [{ closingDate: null }, { createdAt: { gte: start, lt: end } }] }
        ]
      },
      select: {
        id: true, zohoId: true, name: true, stage: true, amount: true,
        closingDate: true, createdAt: true, ownerId: true,
        owner: { select: { id: true, name: true } },
        account: { select: { name: true, zohoId: true } }
      },
      orderBy: { closingDate: "desc" }
    })

    // Get all reps
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" }
    })

    // Fetch payouts — scoped to the target year so historical backfill payouts
    // don't zero out the current year's balance
    const payoutStart = new Date(`${targetYear}-01-01`)
    const payoutEnd = new Date(`${parseInt(targetYear) + 1}-01-01`)
    const payouts = await prisma.payout.findMany({
      where: {
        ...(repId ? { repId } : {}),
        date: { gte: payoutStart, lt: payoutEnd }
      },
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
      const salespersonName = items.salesperson as string | null
      const profit = parseFloat(items.profit || 0)
      const deadCost = parseFloat(items.deadCostTotal || 0)
      const invoiceNumber = items.invoiceNumber || items.invoice_number || null
      const paymentDate = items.paymentDate || null

      const matchedRep = salespersonName ? userByName.get(salespersonName.toLowerCase().trim()) : null

      const isPaid = FINAL_PAID_STATUSES.has(inv.status)

      // Two-stage commission split (each = 25% of profit = 50% of the 50% split):
      //   Upfront: earned at invoice creation  → this week's pay
      //   Final:   earned at invoice payment   → following week's pay
      const upfront = profit * 0.25          // half of rep's share, earned now
      const final   = isPaid ? profit * 0.25 : 0  // second half, only after payment
      const total   = upfront + final


      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoiceNumber,
        name: invoiceNumber ? `${inv.account?.name || 'Unknown'} | INV-${invoiceNumber}` : (inv.account?.name || 'Unknown'),
        amount: inv.amount || 0,
        profit,
        deadCost,
        status: inv.status,
        isPaid,
        issueDate: inv.issueDate,
        paymentDate,
        repId: matchedRep?.id || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: inv.account?.name || "Unknown",
        accountZohoId: inv.account?.zohoId || null,
        commission: { total, upfront, final },
        type: "invoice" as const
      }
    })

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

    // ── Group invoice commissions by rep ─────────────────────────────────
    const byRep: Record<string, any> = {}

    for (const inv of invoiceRecords) {
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
          balance: 0,
        }
      }
      byRep[key].invoices.push(inv)
      byRep[key].totalEarned += inv.commission.total   // upfront + final (if paid)
      byRep[key].totalProfit += inv.profit
      byRep[key].totalSales  += inv.amount
    }

    // Attach deal pipeline activity to reps (for display only)
    for (const deal of dealRecords) {
      const key = deal.repId
      if (!byRep[key]) {
        byRep[key] = {
          repId: deal.repId, repName: deal.repName,
          invoices: [], deals: [], payouts: [],
          totalEarned: 0, totalPaid: 0, totalProfit: 0, totalSales: 0, balance: 0
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

    const allInvoices = repId
      ? invoiceRecords.filter(i => i.repId === repId)
      : invoiceRecords

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
