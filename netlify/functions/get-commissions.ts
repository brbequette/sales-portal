import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  try {
    const { repId, year } = event.queryStringParameters || {}

    // Default to current year to limit payload size
    const targetYear = year || new Date().getFullYear().toString()
    const start = new Date(`${targetYear}-01-01`)
    const end = new Date(`${parseInt(targetYear) + 1}-01-01`)

    // Filter deals by closingDate OR createdAt falling in the target year
    const deals = await prisma.deal.findMany({
      where: {
        OR: [
          { closingDate: { gte: start, lt: end } },
          { AND: [{ closingDate: null }, { createdAt: { gte: start, lt: end } }] }
        ]
      },
      select: {
        id: true,
        zohoId: true,
        name: true,
        stage: true,
        amount: true,
        closingDate: true,
        ownerId: true,
        owner: { select: { id: true, name: true } },
        account: { select: { name: true, zohoId: true } },
      },
      orderBy: { closingDate: "desc" },
    })

    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    })

    // Only fetch invoice number + profit data
    const invoices = await prisma.invoice.findMany({
      select: { zohoId: true, items: true }
    })

    const payouts = await prisma.payout.findMany({
      where: repId ? { repId } : undefined,
      orderBy: { date: "desc" }
    })

    const userByName = new Map(users.map(u => [u.name?.toLowerCase().trim(), u]))

    const dealsWithCommission = deals.map(deal => {
      const amount = deal.amount || 0
      const stage = (deal.stage || "").toLowerCase()
      const isClosed = stage.includes("closed won") || stage.includes("fulfilled") || stage.includes("paid")
      const isLost = stage.includes("closed lost")

      const parts = deal.name.split('|')
      let docNum = null
      if (parts.length >= 2) {
        docNum = parts[1].trim().replace('EST-', '').replace('SO-', '')
      }

      let profit = 0
      let deadCost = 0
      let invoiceZohoId = null
      let salespersonName = null

      if (docNum) {
        const matchingInvoice = invoices.find(inv => {
          const invNum = (inv.items as any)?.invoiceNumber || (inv.items as any)?.invoice_number || ''
          return invNum === docNum || inv.zohoId.endsWith(docNum)
        })
        if (matchingInvoice) {
          profit = (matchingInvoice.items as any)?.profit || 0
          deadCost = (matchingInvoice.items as any)?.deadCostTotal || 0
          invoiceZohoId = matchingInvoice.zohoId
          salespersonName = (matchingInvoice.items as any)?.salesperson
        }
      }

      const baseValue = (profit > 0) ? profit : amount
      const commissionTotal = baseValue * 0.10
      const comm = { total: commissionTotal, upfront: commissionTotal * 0.5, final: commissionTotal * 0.5 }

      let matchedRep = null
      if (salespersonName) matchedRep = userByName.get(salespersonName.toLowerCase().trim())

      return {
        id: deal.id,
        zohoId: deal.zohoId,
        name: deal.name,
        stage: deal.stage,
        amount,
        profit,
        deadCost,
        closeDate: deal.closingDate,
        repId: matchedRep ? matchedRep.id : (deal.ownerId || "unassigned"),
        repName: matchedRep ? matchedRep.name : (deal.owner?.name || "Unassigned"),
        accountName: deal.account?.name || "Unknown",
        accountZohoId: deal.account?.zohoId || null,
        commission: comm,
        status: isLost ? "lost" : isClosed ? "fulfilled" : "pending",
        invoiceZohoId
      }
    })

    // Group by rep
    const byRep: Record<string, any> = {}
    for (const deal of dealsWithCommission) {
      const key = deal.repId || "unassigned"
      if (!byRep[key]) {
        byRep[key] = { repId: deal.repId, repName: deal.repName, deals: [], payouts: [], totalEarned: 0, totalPaid: 0, totalProfit: 0, balance: 0 }
      }
      byRep[key].deals.push(deal)
      if (deal.status !== "lost") {
        byRep[key].totalEarned += deal.commission.total
        byRep[key].totalProfit += deal.profit || 0
      }
    }

    for (const payout of payouts) {
      if (byRep[payout.repId]) {
        byRep[payout.repId].payouts.push(payout)
        byRep[payout.repId].totalPaid += payout.amount
      }
    }
    Object.values(byRep).forEach((rep: any) => { rep.balance = rep.totalEarned - rep.totalPaid })

    // Get available years from both deals (closingDate OR createdAt) and invoices (issueDate)
    const yearRows = await prisma.$queryRaw<{y: number}[]>`
      SELECT DISTINCT y FROM (
        SELECT EXTRACT(YEAR FROM "closingDate")::int AS y FROM "Deal" WHERE "closingDate" IS NOT NULL
        UNION
        SELECT EXTRACT(YEAR FROM "createdAt")::int AS y FROM "Deal" WHERE "closingDate" IS NULL
        UNION
        SELECT EXTRACT(YEAR FROM "issueDate")::int AS y FROM "Invoice" WHERE "issueDate" IS NOT NULL
      ) t WHERE y IS NOT NULL ORDER BY y DESC
    `
    const years = yearRows.map(r => r.y)

    let finalDeals = dealsWithCommission
    let finalByRep = byRep
    if (repId) {
      finalDeals = dealsWithCommission.filter(d => d.repId === repId)
      finalByRep = {}
      if (byRep[repId]) finalByRep[repId] = byRep[repId]
    }

    const totalDeals = finalDeals.length
    const totalRevenue = finalDeals.reduce((s, d) => s + (d.amount || 0), 0)
    const totalCommissions = finalDeals.filter(d => d.status !== "lost").reduce((s, d) => s + d.commission.total, 0)
    const totalProfit = finalDeals.filter(d => d.status !== "lost").reduce((s, d) => s + d.profit, 0)

    const responseBody = JSON.stringify({
      success: true,
      year: targetYear,
      deals: finalDeals,
      byRep: finalByRep,
      users,
      years,
      stats: { totalDeals, totalRevenue, totalCommissions, totalProfit },
    })

    // Safety valve: if still too large, strip deals array and return summaries only
    if (responseBody.length > 5 * 1024 * 1024) {
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({
          success: true, year: targetYear, deals: [], byRep: finalByRep,
          users, years, stats: { totalDeals, totalRevenue, totalCommissions, totalProfit }, truncated: true,
        }),
      }
    }

    return { statusCode: 200, headers: cors, body: responseBody }
  } catch (err: any) {
    console.error("get-commissions error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
