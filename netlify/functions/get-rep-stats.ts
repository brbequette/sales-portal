import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    // 1. Fetch all users
    const users = await prisma.user.findMany({
      select: { id: true, name: true, email: true, role: true },
      orderBy: { name: "asc" }
    })

    // 2. Fetch all accounts with invoices
    const accounts = await prisma.account.findMany({
      select: {
        id: true,
        ownerId: true,
        status: true,
        invoices: {
          select: {
            amount: true,
            status: true,
            items: true,
            issueDate: true
          }
        }
      }
    })

    // 3. Fetch all deals
    const deals = await prisma.deal.findMany({
      select: {
        id: true,
        ownerId: true,
        amount: true,
        stage: true,
        closingDate: true
      }
    })

    // 4. Group metrics by User ID
    const repStatsMap: Record<string, any> = {}
    const repWeeklyStats: Record<string, Record<string, any>> = {}
    const repMonthlyStats: Record<string, Record<string, any>> = {}

    const getMonday = (d: Date | string) => {
      const date = new Date(d)
      const day = date.getDay()
      const diff = date.getDate() - day + (day === 0 ? -6 : 1)
      const monday = new Date(date.setDate(diff))
      monday.setHours(0, 0, 0, 0)
      return monday
    }

    const formatDateKey = (d: Date) => {
      const yyyy = d.getFullYear()
      const mm = String(d.getMonth() + 1).padStart(2, '0')
      const dd = String(d.getDate()).padStart(2, '0')
      return `${yyyy}-${mm}-${dd}`
    }

    const getMonthKey = (d: Date | string) => {
      const date = new Date(d)
      const yyyy = date.getFullYear()
      const mm = String(date.getMonth() + 1).padStart(2, '0')
      return `${yyyy}-${mm}`
    }

    // Initialize map
    users.forEach(u => {
      repStatsMap[u.id] = {
        repId: u.id,
        repName: u.name || u.email.split("@")[0],
        email: u.email,
        role: u.role,
        revenue: 0,
        profit: 0,
        margin: 0,
        activeAccounts: 0,
        updateAccounts: 0,
        totalDeals: 0,
        closedWonDeals: 0,
        dealRevenue: 0,
        commissions: 0,
        overdueCollections: 0
      }
    })

    // Add unassigned key just in case
    const unassignedId = "unassigned"
    repStatsMap[unassignedId] = {
      repId: unassignedId,
      repName: "Unassigned",
      email: "",
      role: "",
      revenue: 0,
      profit: 0,
      margin: 0,
      activeAccounts: 0,
      updateAccounts: 0,
      totalDeals: 0,
      closedWonDeals: 0,
      dealRevenue: 0,
      commissions: 0,
      overdueCollections: 0
    }

    const getInitialMetrics = () => ({
      revenue: 0,
      profit: 0,
      closedWonDeals: 0,
      commissions: 0
    })

    // Process accounts and invoices
    accounts.forEach(acc => {
      const ownerId = acc.ownerId || unassignedId
      if (!repStatsMap[ownerId]) {
        // Fallback for missing reps
        return
      }

      if (acc.status === "Update Status") {
        repStatsMap[ownerId].updateAccounts++
      } else {
        repStatsMap[ownerId].activeAccounts++
      }

      const invoices = acc.invoices || []
      invoices.forEach(inv => {
        const amount = parseFloat(inv.amount as any) || 0
        repStatsMap[ownerId].revenue += amount

        const profit = parseFloat((inv.items as any)?.profit as any) || 0
        repStatsMap[ownerId].profit += profit

        if (inv.status === "Overdue") {
          const balance = typeof inv.items === "object" && inv.items !== null && "balance" in inv.items
            ? parseFloat((inv.items as any).balance)
            : amount;
          repStatsMap[ownerId].overdueCollections += isNaN(balance) ? 0 : balance
        }

        // Aggregate by week/month for the rep
        if (inv.issueDate) {
          const date = new Date(inv.issueDate)
          if (!isNaN(date.getTime())) {
            const monday = getMonday(date)
            const weekKey = formatDateKey(monday)
            const monthKey = getMonthKey(date)

            if (!repWeeklyStats[ownerId]) repWeeklyStats[ownerId] = {}
            if (!repWeeklyStats[ownerId][weekKey]) {
              repWeeklyStats[ownerId][weekKey] = getInitialMetrics()
            }
            repWeeklyStats[ownerId][weekKey].revenue += amount
            repWeeklyStats[ownerId][weekKey].profit += profit

            if (!repMonthlyStats[ownerId]) repMonthlyStats[ownerId] = {}
            if (!repMonthlyStats[ownerId][monthKey]) {
              repMonthlyStats[ownerId][monthKey] = getInitialMetrics()
            }
            repMonthlyStats[ownerId][monthKey].revenue += amount
            repMonthlyStats[ownerId][monthKey].profit += profit
          }
        }
      })
    })

    // Process deals
    deals.forEach(deal => {
      const ownerId = deal.ownerId || unassignedId
      if (!repStatsMap[ownerId]) return

      repStatsMap[ownerId].totalDeals++

      const stage = (deal.stage || "").toLowerCase()
      const isClosedWon = stage.includes("closed won") || stage.includes("fulfilled") || stage.includes("paid")
      
      if (isClosedWon) {
        repStatsMap[ownerId].closedWonDeals++
        const amount = parseFloat(deal.amount as any) || 0
        const commission = amount * 0.10 // 10% rate
        repStatsMap[ownerId].dealRevenue += amount
        repStatsMap[ownerId].commissions += commission

        // Aggregate by week/month for the rep
        if (deal.closingDate) {
          const date = new Date(deal.closingDate)
          if (!isNaN(date.getTime())) {
            const monday = getMonday(date)
            const weekKey = formatDateKey(monday)
            const monthKey = getMonthKey(date)

            if (!repWeeklyStats[ownerId]) repWeeklyStats[ownerId] = {}
            if (!repWeeklyStats[ownerId][weekKey]) {
              repWeeklyStats[ownerId][weekKey] = getInitialMetrics()
            }
            repWeeklyStats[ownerId][weekKey].closedWonDeals++
            repWeeklyStats[ownerId][weekKey].commissions += commission

            if (!repMonthlyStats[ownerId]) repMonthlyStats[ownerId] = {}
            if (!repMonthlyStats[ownerId][monthKey]) {
              repMonthlyStats[ownerId][monthKey] = getInitialMetrics()
            }
            repMonthlyStats[ownerId][monthKey].closedWonDeals++
            repMonthlyStats[ownerId][monthKey].commissions += commission
          }
        }
      }
    })

    // Calculate margins & determine target records
    const now = new Date()
    const currentWeekKey = formatDateKey(getMonday(now))
    const currentMonthKey = getMonthKey(now)

    Object.keys(repStatsMap).forEach(key => {
      const rep = repStatsMap[key]
      if (rep.revenue > 0) {
        rep.margin = (rep.profit / rep.revenue) * 100
      }

      // Calculate weeklyRecord (excluding currentWeekKey)
      const weeklyRecord = getInitialMetrics()
      if (repWeeklyStats[key]) {
        Object.keys(repWeeklyStats[key]).forEach(w => {
          if (w === currentWeekKey) return
          const ws = repWeeklyStats[key][w]
          if (ws.revenue > weeklyRecord.revenue) weeklyRecord.revenue = ws.revenue
          if (ws.profit > weeklyRecord.profit) weeklyRecord.profit = ws.profit
          if (ws.closedWonDeals > weeklyRecord.closedWonDeals) weeklyRecord.closedWonDeals = ws.closedWonDeals
          if (ws.commissions > weeklyRecord.commissions) weeklyRecord.commissions = ws.commissions
        })
      }

      // Current week stats
      const currentWeek = repWeeklyStats[key]?.[currentWeekKey] || getInitialMetrics()

      // Calculate monthlyRecord (excluding currentMonthKey)
      const monthlyRecord = getInitialMetrics()
      if (repMonthlyStats[key]) {
        Object.keys(repMonthlyStats[key]).forEach(m => {
          if (m === currentMonthKey) return
          const ms = repMonthlyStats[key][m]
          if (ms.revenue > monthlyRecord.revenue) monthlyRecord.revenue = ms.revenue
          if (ms.profit > monthlyRecord.profit) monthlyRecord.profit = ms.profit
          if (ms.closedWonDeals > monthlyRecord.closedWonDeals) monthlyRecord.closedWonDeals = ms.closedWonDeals
          if (ms.commissions > monthlyRecord.commissions) monthlyRecord.commissions = ms.commissions
        })
      }

      // Current month stats
      const currentMonth = repMonthlyStats[key]?.[currentMonthKey] || getInitialMetrics()

      rep.currentWeek = currentWeek
      rep.weeklyRecord = weeklyRecord
      rep.currentMonth = currentMonth
      rep.monthlyRecord = monthlyRecord
    })

    // Filter out unassigned and users who have absolutely zero activity to keep list clean
    // (but keep standard users)
    const activeReps = Object.values(repStatsMap).filter((rep: any) => {
      if (rep.repId === unassignedId) {
        return rep.revenue > 0 || rep.totalDeals > 0
      }
      // Keep all seeded reps
      return true
    })

    // 5. Calculate company totals & averages
    // Only count users who are actual sales reps or admins with accounts
    const companyTotals = {
      revenue: 0,
      profit: 0,
      activeAccounts: 0,
      updateAccounts: 0,
      totalDeals: 0,
      closedWonDeals: 0,
      dealRevenue: 0,
      commissions: 0,
      overdueCollections: 0
    }

    let repCountForAvg = 0

    activeReps.forEach((rep: any) => {
      if (rep.repId !== unassignedId) {
        companyTotals.revenue += rep.revenue
        companyTotals.profit += rep.profit
        companyTotals.activeAccounts += rep.activeAccounts
        companyTotals.updateAccounts += rep.updateAccounts
        companyTotals.totalDeals += rep.totalDeals
        companyTotals.closedWonDeals += rep.closedWonDeals
        companyTotals.dealRevenue += rep.dealRevenue
        companyTotals.commissions += rep.commissions
        companyTotals.overdueCollections += rep.overdueCollections
        repCountForAvg++
      }
    })

    const companyAverages = {
      revenue: repCountForAvg > 0 ? companyTotals.revenue / repCountForAvg : 0,
      profit: repCountForAvg > 0 ? companyTotals.profit / repCountForAvg : 0,
      margin: companyTotals.revenue > 0 ? (companyTotals.profit / companyTotals.revenue) * 100 : 0,
      activeAccounts: repCountForAvg > 0 ? companyTotals.activeAccounts / repCountForAvg : 0,
      updateAccounts: repCountForAvg > 0 ? companyTotals.updateAccounts / repCountForAvg : 0,
      totalDeals: repCountForAvg > 0 ? companyTotals.totalDeals / repCountForAvg : 0,
      closedWonDeals: repCountForAvg > 0 ? companyTotals.closedWonDeals / repCountForAvg : 0,
      dealRevenue: repCountForAvg > 0 ? companyTotals.dealRevenue / repCountForAvg : 0,
      commissions: repCountForAvg > 0 ? companyTotals.commissions / repCountForAvg : 0,
      overdueCollections: repCountForAvg > 0 ? companyTotals.overdueCollections / repCountForAvg : 0
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        reps: activeReps.filter((r: any) => r.repId !== unassignedId || r.revenue > 0),
        companyTotals,
        companyAverages
      })
    }

  } catch (error: any) {
    console.error("Get Rep Stats Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
