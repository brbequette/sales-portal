import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  try {
    const { repId, year } = event.queryStringParameters || {}

    // Pull all deals from DB with correct field names
    const whereClause: any = {}
    if (year) {
      const start = new Date(`${year}-01-01`)
      const end = new Date(`${parseInt(year) + 1}-01-01`)
      whereClause.closingDate = { gte: start, lt: end }
    }
    if (repId) {
      whereClause.ownerId = repId
    }

    const deals = await prisma.deal.findMany({
      where: whereClause,
      include: {
        account: true,
        owner: true,
      },
      orderBy: { closingDate: "desc" },
    })

    // Get all reps
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" },
    })

    // Fetch invoices to match for profit numbers
    const invoices = await prisma.invoice.findMany({
      select: {
        zohoId: true,
        items: true,
      }
    })

    // Fetch payouts
    const payouts = await prisma.payout.findMany({
      where: repId ? { repId } : undefined,
      orderBy: { date: "desc" }
    })

    // Commission: 10% of gross revenue
    const COMMISSION_RATE = 0.10
    const calcCommission = (amount: number) => {
      const total = amount * COMMISSION_RATE
      return { total, upfront: total * 0.5, final: total * 0.5 }
    }

    const dealsWithCommission = deals.map(deal => {
      const amount = deal.amount || 0
      const comm = calcCommission(amount)
      const stage = (deal.stage || "").toLowerCase()
      const isClosed = stage.includes("closed won") || stage.includes("fulfilled") || stage.includes("paid")
      const isLost = stage.includes("closed lost")

      // Extract document number from deal name
      const parts = deal.name.split('|')
      let docNum = null
      if (parts.length >= 2) {
        docNum = parts[1].trim().replace('EST-', '').replace('SO-', '')
      }

      let profit = 0
      let deadCost = 0
      let invoiceZohoId = null

      if (docNum) {
        const matchingInvoice = invoices.find(inv => {
          const invNum = (inv.items as any)?.invoiceNumber || (inv.items as any)?.invoice_number || ''
          return invNum === docNum || inv.zohoId.endsWith(docNum)
        })
        if (matchingInvoice) {
          profit = (matchingInvoice.items as any)?.profit || 0
          deadCost = (matchingInvoice.items as any)?.deadCostTotal || 0
          invoiceZohoId = matchingInvoice.zohoId
        }
      }

      return {
        id: deal.id,
        zohoId: deal.zohoId,
        name: deal.name,
        stage: deal.stage,
        amount,
        profit,
        deadCost,
        closeDate: deal.closingDate,
        repId: deal.ownerId,
        repName: deal.owner?.name || "Unassigned",
        accountName: deal.account?.name || "Unknown",
        accountZohoId: deal.account?.zohoId || null,
        commission: comm,
        status: isLost ? "lost" : isClosed ? "fulfilled" : "pending",
        invoiceZohoId: invoiceZohoId
      }
    })

    // Group by rep
    const byRep: Record<string, any> = {}
    for (const deal of dealsWithCommission) {
      const key = deal.repId || "unassigned"
      if (!byRep[key]) {
        byRep[key] = {
          repId: deal.repId,
          repName: deal.repName,
          deals: [],
          payouts: [],
          totalEarned: 0,
          totalPaid: 0,
          totalProfit: 0,
          balance: 0,
        }
      }
      byRep[key].deals.push(deal)
      if (deal.status !== "lost") {
        byRep[key].totalEarned += deal.commission.total
        byRep[key].totalProfit += deal.profit || 0
      }
    }
    // Add payouts and calculate balance
    for (const payout of payouts) {
      if (byRep[payout.repId]) {
        byRep[payout.repId].payouts.push(payout)
        byRep[payout.repId].totalPaid += payout.amount
      }
    }

    Object.values(byRep).forEach((rep: any) => {
      rep.balance = rep.totalEarned - rep.totalPaid
    })

    // Available years from deal closingDate
    const allYears = deals
      .map(d => d.closingDate ? new Date(d.closingDate).getFullYear() : null)
      .filter((y): y is number => y !== null)
    const years = [...new Set(allYears)].sort((a, b) => b - a)

    const totalDeals = deals.length
    const totalRevenue = deals.reduce((s, d) => s + (d.amount || 0), 0)
    const totalCommissions = dealsWithCommission
      .filter(d => d.status !== "lost")
      .reduce((s, d) => s + d.commission.total, 0)
    const totalProfit = dealsWithCommission
      .filter(d => d.status !== "lost")
      .reduce((s, d) => s + d.profit, 0)

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        deals: dealsWithCommission,
        byRep,
        users,
        years,
        stats: { totalDeals, totalRevenue, totalCommissions, totalProfit },
      }),
    }
  } catch (err: any) {
    console.error("get-commissions error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
