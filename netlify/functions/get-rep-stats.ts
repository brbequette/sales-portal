import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// Workday calculation helpers
function getWorkdaysCount(startDate: Date, endDate: Date, holidays: any[]): number {
  let count = 0;
  const cur = new Date(startDate);
  cur.setHours(0,0,0,0);
  const targetEnd = new Date(endDate);
  targetEnd.setHours(0,0,0,0);
  
  const holidayStrings = holidays.map(h => typeof h === 'string' ? h : h.date);
  const holidaySet = new Set(holidayStrings);

  while (cur <= targetEnd) {
    const day = cur.getDay();
    if (day !== 0 && day !== 6) { // Not Sunday or Saturday
      const dateStr = cur.toISOString().split('T')[0];
      if (!holidaySet.has(dateStr)) {
        count++;
      }
    }
    cur.setDate(cur.getDate() + 1);
  }
  return count;
}

function getWorkdaysInMonth(year: number, month: number, holidays: any[]): number {
  const startDate = new Date(year, month, 1);
  const endDate = new Date(year, month + 1, 0); // Last day of month
  return getWorkdaysCount(startDate, endDate, holidays);
}

function getWorkdaysInWeek(date: Date, holidays: any[]): number {
  // Find Monday of the week
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  monday.setHours(0,0,0,0);
  
  // Sunday of the week
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  sunday.setHours(23, 59, 59, 999);
  
  return getWorkdaysCount(monday, sunday, holidays);
}

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
    const { includeHidden } = event.queryStringParameters || {}
    const showHidden = includeHidden === 'true'

    // 1. Fetch settings (holidays, sales targets)
    const settings = await prisma.systemSetting.findMany()
    const settingsMap = new Map(settings.map(s => [s.key, s.value]))
    const holidays: string[] = JSON.parse(settingsMap.get("holidays") || "[]")
    const salesTargets: Record<string, number> = JSON.parse(settingsMap.get("sales_targets") || "{}")
    const subtotalTargets: Record<string, number> = JSON.parse(settingsMap.get("subtotal_targets") || "{}")
    const visibleReps: string[] = JSON.parse(settingsMap.get("visible_reps") || "[]")

    // 2. Fetch all users (excluding inactive dummy/test users)
    const users = await prisma.user.findMany({
      where: {
        AND: [
          { NOT: { email: { contains: "dummy.titandiamond.com" } } },
          { NOT: { email: { contains: "example.com" } } },
          { NOT: { name: { contains: "test_migration" } } }
        ]
      },
      select: { 
        id: true, 
        name: true, 
        email: true, 
        role: true,
        constantVigEnabled: true,
        constantVigValue: true,
        monthlyVigGoals: true
      },
      orderBy: { name: "asc" }
    })

    // 3. Map usernames to user IDs for salesperson matching
    const userNameToIdMap: Record<string, string> = {}
    users.forEach(u => {
      if (u.name) {
        userNameToIdMap[u.name.toLowerCase().trim()] = u.id
      }
    })

    // 4. Fetch all accounts
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

    // 5. Fetch all deals
    const deals = await prisma.deal.findMany({
      select: {
        id: true,
        ownerId: true,
        name: true,
        amount: true,
        stage: true,
        closingDate: true
      }
    })

    // 6. Fetch all invoices for deal matching
    const allInvoicesForMatching = await prisma.invoice.findMany({
      select: {
        zohoId: true,
        items: true
      }
    })

    const unassignedId = "unassigned"

    // Time ranges
    const now = new Date()
    // Daily range
    const todayStart = new Date(now)
    todayStart.setHours(0,0,0,0)
    const todayEnd = new Date(now)
    todayEnd.setHours(23,59,59,999)

    // Weekly range (Monday to Sunday)
    const monday = new Date(now)
    const day = monday.getDay()
    const diff = monday.getDate() - day + (day === 0 ? -6 : 1)
    monday.setDate(diff)
    monday.setHours(0,0,0,0)
    const sunday = new Date(monday)
    sunday.setDate(monday.getDate() + 6)
    sunday.setHours(23,59,59,999)

    // Monthly range
    const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1)
    const lastOfMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0)
    lastOfMonth.setHours(23,59,59,999)

    // Workdays count for targets
    const workdaysInWeek = getWorkdaysInWeek(now, holidays)
    const workdaysInMonth = getWorkdaysInMonth(now.getFullYear(), now.getMonth(), holidays)

    // Initialize repStatsMap
    const repStatsMap: Record<string, any> = {}
    
    users.forEach(u => {
      const dailyGoal = salesTargets[u.id] || 0
      const weeklyGoal = dailyGoal * workdaysInWeek
      const monthlyGoal = dailyGoal * workdaysInMonth
      
      const dailySubtotalGoal = subtotalTargets[u.id] || (dailyGoal * 2)
      const weeklySubtotalGoal = dailySubtotalGoal * workdaysInWeek
      const monthlySubtotalGoal = dailySubtotalGoal * workdaysInMonth

      repStatsMap[u.id] = {
        repId: u.id,
        repName: u.name || u.email.split("@")[0],
        email: u.email,
        role: u.role,
        constantVigEnabled: u.constantVigEnabled,
        constantVigValue: u.constantVigValue,
        monthlyVigGoals: u.monthlyVigGoals,
        // All-time totals
        revenue: 0,
        profit: 0,
        margin: 0,
        activeAccounts: 0,
        updateAccounts: 0,
        totalDeals: 0,
        closedWonDeals: 0,
        dealRevenue: 0,
        commissions: 0,
        overdueCollections: 0,
        
        // Target settings
        salesTargets: {
          daily: dailyGoal,
          weekly: weeklyGoal,
          monthly: monthlyGoal,
          dailySubtotal: dailySubtotalGoal,
          weeklySubtotal: weeklySubtotalGoal,
          monthlySubtotal: monthlySubtotalGoal
        },

        // Periodic breakdowns
        daily: { revenue: 0, profit: 0, dealsWon: 0, target: dailyGoal },
        weekly: { revenue: 0, profit: 0, dealsWon: 0, target: weeklyGoal },
        monthly: { revenue: 0, profit: 0, dealsWon: 0, target: monthlyGoal }
      }
    })

    repStatsMap[unassignedId] = {
      repId: unassignedId,
      repName: "Unassigned",
      email: "",
      role: "",
      constantVigEnabled: false,
      constantVigValue: 1.5,
      monthlyVigGoals: [],
      revenue: 0,
      profit: 0,
      margin: 0,
      activeAccounts: 0,
      updateAccounts: 0,
      totalDeals: 0,
      closedWonDeals: 0,
      dealRevenue: 0,
      commissions: 0,
      overdueCollections: 0,
      salesTargets: { daily: 0, weekly: 0, monthly: 0, dailySubtotal: 0, weeklySubtotal: 0, monthlySubtotal: 0 },
      daily: { revenue: 0, profit: 0, dealsWon: 0, target: 0 },
      weekly: { revenue: 0, profit: 0, dealsWon: 0, target: 0 },
      monthly: { revenue: 0, profit: 0, dealsWon: 0, target: 0 }
    }

    // Process accounts (account owner attributes counts)
    accounts.forEach(acc => {
      const ownerId = acc.ownerId || unassignedId
      if (!repStatsMap[ownerId]) return

      if (acc.status === "Update Status") {
        repStatsMap[ownerId].updateAccounts++
      } else {
        repStatsMap[ownerId].activeAccounts++
      }

      const invoices = acc.invoices || []
      invoices.forEach(inv => {
        const items = inv.items as any || {}
        const amount = parseFloat(items.sub_total) || parseFloat(inv.amount as any) || 0
        const deadCost = parseFloat((inv.items as any)?.deadCostTotal as any) || 0;
        
        // "Dead Profit" is pure amount minus pure dead cost. Displayed on the dashboard.
        const deadProfit = amount - deadCost;
        
        // Actual profit comes from Zoho which factors in Vig correctly on applicable items
        const zohoProfit = parseFloat((inv.items as any)?.profit as any) || 0;
        
        const profit = deadCost > 0 ? deadProfit : zohoProfit;
        const issueDate = inv.issueDate ? new Date(inv.issueDate) : null

        // Find salesperson on invoice
        const salespersonName = (inv.items as any)?.salesperson
        let repId = unassignedId
        if (salespersonName) {
          const matchedId = userNameToIdMap[salespersonName.toLowerCase().trim()]
          if (matchedId) repId = matchedId
        }
        if (repId === unassignedId) {
          repId = acc.ownerId || unassignedId
        }

        if (repStatsMap[repId]) {
          const isValidInvoice = inv.status !== 'Void' && inv.status !== 'Draft'
          const isVoided = inv.status === 'Void'

          if (isValidInvoice) {
            repStatsMap[repId].revenue += amount
            repStatsMap[repId].profit += profit
            repStatsMap[repId].commissions += zohoProfit * 0.50
          } else if (isVoided) {
            repStatsMap[repId].commissions -= zohoProfit * 0.50
          }

          if (inv.status === "Overdue") {
            const balance = typeof inv.items === "object" && inv.items !== null && "balance" in inv.items
              ? parseFloat((inv.items as any).balance)
              : amount;
            repStatsMap[repId].overdueCollections += isNaN(balance) ? 0 : balance
          }

          // Aggregates for periods
          if (issueDate && isValidInvoice) {
            if (issueDate >= todayStart && issueDate <= todayEnd) {
              repStatsMap[repId].daily.revenue += amount
              repStatsMap[repId].daily.profit += profit
            }
            if (issueDate >= monday && issueDate <= sunday) {
              repStatsMap[repId].weekly.revenue += amount
              repStatsMap[repId].weekly.profit += profit
            }
            if (issueDate >= firstOfMonth && issueDate <= lastOfMonth) {
              repStatsMap[repId].monthly.revenue += amount
              repStatsMap[repId].monthly.profit += profit
            }
          }
        }
      })
    })

    // Process deals
    deals.forEach(deal => {
      const parts = deal.name.split('|')
      let docNum = null
      if (parts.length >= 2) {
        docNum = parts[1].trim().replace('EST-', '').replace('SO-', '')
      }

      let salespersonName = null
      if (docNum) {
        const matchingInvoice = allInvoicesForMatching.find(inv => {
          const invNum = (inv.items as any)?.invoiceNumber || (inv.items as any)?.invoice_number || ''
          return invNum === docNum || inv.zohoId.endsWith(docNum)
        })
        if (matchingInvoice) {
          salespersonName = (matchingInvoice.items as any)?.salesperson
        }
      }

      let repId = unassignedId
      if (salespersonName) {
        const matchedId = userNameToIdMap[salespersonName.toLowerCase().trim()]
        if (matchedId) repId = matchedId
      }
      if (repId === unassignedId) {
        repId = deal.ownerId || unassignedId
      }

      if (repStatsMap[repId]) {
        repStatsMap[repId].totalDeals++
        const stage = (deal.stage || "").toLowerCase()
        const isClosedWon = stage.includes("closed won") || stage.includes("fulfilled") || stage.includes("paid")
        
        if (isClosedWon) {
          repStatsMap[repId].closedWonDeals++
          const amount = parseFloat(deal.amount as any) || 0
          const commission = amount * 0.10 // 10% rate
          repStatsMap[repId].dealRevenue += amount
          repStatsMap[repId].commissions += commission

          // Aggregates for periods
          const closeDate = deal.closingDate ? new Date(deal.closingDate) : null
          if (closeDate) {
            if (closeDate >= todayStart && closeDate <= todayEnd) {
              repStatsMap[repId].daily.dealsWon++
            }
            if (closeDate >= monday && closeDate <= sunday) {
              repStatsMap[repId].weekly.dealsWon++
            }
            if (closeDate >= firstOfMonth && closeDate <= lastOfMonth) {
              repStatsMap[repId].monthly.dealsWon++
            }
          }
        }
      }
    })

    // Finalize margins, vig rates, and progress for current period
    Object.keys(repStatsMap).forEach(key => {
      const rep = repStatsMap[key]
      if (rep.revenue > 0) {
        rep.margin = (rep.profit / rep.revenue) * 100
      }

      // Calculate vigRate for the current month based on profit target
      const currentMonthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
      const dailyGoal = rep.salesTargets?.daily || 0;
      const defaultProfitGoal = dailyGoal * workdaysInMonth;
      const defaultSubtotalGoal = defaultProfitGoal * 2;
      
      const vigGoal = rep.monthlyVigGoals?.find((g: any) => g.monthKey === currentMonthKey) || {
        metric: 'PROFIT',
        profitGoal: defaultProfitGoal || 20000,
        subtotalGoal: defaultSubtotalGoal || 40000,
        manualVigRate: null
      };

      // Ensure 2026+ is always PROFIT
      if (now.getFullYear() >= 2026) {
        vigGoal.metric = 'PROFIT';
      }

      if (now.getFullYear() < 2025) {
        rep.monthly.vigRate = 1.3;
      } else if (rep.constantVigEnabled && rep.constantVigValue !== null) {
        rep.monthly.vigRate = rep.constantVigValue;
      } else if (vigGoal.manualVigRate !== null) {
        rep.monthly.vigRate = vigGoal.manualVigRate;
      } else {
        const target = vigGoal.metric === 'SUBTOTAL' ? vigGoal.subtotalGoal : vigGoal.profitGoal;
        const actual = vigGoal.metric === 'SUBTOTAL' ? rep.monthly.revenue : rep.monthly.profit;
        const metGoal = actual >= target;
        // Keep Montgomery hardcode fallback if constantVig is not enabled yet
        const isMontgomery = rep.repName && rep.repName.toLowerCase().includes("montgomery") && rep.repName.toLowerCase().includes("morgan");
        rep.monthly.vigRate = isMontgomery ? 1.0 : (metGoal ? 1.3 : 1.5);
      }
    })

    // Compute historical vig rates (ALL TIME)
    const historicalVigRates: any[] = []
    
    // Find the oldest invoice date
    const oldestInvoice = await prisma.invoice.findFirst({
      orderBy: { issueDate: 'asc' },
      select: { issueDate: true }
    });
    
    let historyMonths = 6; // default fallback
    if (oldestInvoice?.issueDate) {
      const oldestDate = new Date(oldestInvoice.issueDate);
      const monthsDiff = (now.getFullYear() - oldestDate.getFullYear()) * 12 + (now.getMonth() - oldestDate.getMonth());
      historyMonths = Math.max(1, monthsDiff);
    }

    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)

    const allHistoricalInvoices = await prisma.invoice.findMany({
      where: {
        issueDate: { lte: endOfLastMonth }
      },
      select: {
        issueDate: true,
        amount: true,
        status: true,
        items: true,
        accountId: true,
        account: {
          select: { ownerId: true }
        }
      }
    })

    // Group invoices by month key in JS
    const invoicesByMonth = new Map<string, typeof allHistoricalInvoices>()
    for (const inv of allHistoricalInvoices) {
      if (!inv.issueDate) continue
      const d = new Date(inv.issueDate)
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
      if (!invoicesByMonth.has(key)) invoicesByMonth.set(key, [])
      invoicesByMonth.get(key)!.push(inv)
    }

    for (let m = 1; m <= historyMonths; m++) {
      const targetMonthDate = new Date(now.getFullYear(), now.getMonth() - m, 1)
      const year = targetMonthDate.getFullYear()
      const monthIdx = targetMonthDate.getMonth() // 0-indexed
      
      const monthName = targetMonthDate.toLocaleDateString("en-US", { month: "short", year: "numeric" })
      const monthKey = `${year}-${String(monthIdx + 1).padStart(2, '0')}`

      const workdays = getWorkdaysInMonth(year, monthIdx, holidays)

      // Use pre-fetched invoices for this month
      const monthInvoices = invoicesByMonth.get(monthKey) || []

      // Group profit and subtotal by rep
      const repProfit: Record<string, number> = {}
      const repSubtotal: Record<string, number> = {}
      users.forEach(u => { 
        repProfit[u.id] = 0;
        repSubtotal[u.id] = 0;
      })

      monthInvoices.forEach(inv => {
        const subtotal = parseFloat(inv.amount as any) || 0
        const deadCost = parseFloat((inv.items as any)?.deadCostTotal as any) || 0;
        const profit = deadCost > 0 ? (subtotal - deadCost) : (parseFloat((inv.items as any)?.profit as any) || 0)
        const salespersonName = (inv.items as any)?.salesperson
        let repId = unassignedId
        if (salespersonName) {
          const matchedId = userNameToIdMap[salespersonName.toLowerCase().trim()]
          if (matchedId) repId = matchedId
        }
        if (repId === unassignedId) {
          repId = inv.account?.ownerId || unassignedId
        }

        const isValidInvoice = inv.status !== 'Void' && inv.status !== 'Draft'
        if (isValidInvoice && repProfit[repId] !== undefined) {
          repProfit[repId] += profit
          repSubtotal[repId] += subtotal
        }
      })

      // Build stats for each rep based on DB targets or defaults
      const repVigs: Record<string, { metric: string, target: number, subtotalGoal: number, profitGoal: number, sales: number, profit: number, subtotal: number, vigRate: number, manualVigRate: number | null }> = {}
      users.forEach(u => {
        const dailyGoal = salesTargets[u.id] || 0;
        const defaultProfitGoal = dailyGoal * workdays;
        
        const dailySubtotalGoal = subtotalTargets[u.id] || (dailyGoal * 2);
        const defaultSubtotalGoal = dailySubtotalGoal * workdays;

        const vigGoal = (u as any).monthlyVigGoals?.find((g: any) => g.monthKey === monthKey) || {
          metric: 'PROFIT',
          profitGoal: defaultProfitGoal || 20000,
          subtotalGoal: defaultSubtotalGoal || 40000,
          manualVigRate: null
        };
        
        // Ensure 2026+ is always PROFIT
        if (year >= 2026) {
          vigGoal.metric = 'PROFIT';
        }

        const profit = repProfit[u.id] || 0;
        const subtotal = repSubtotal[u.id] || 0;
        
        const target = vigGoal.metric === 'SUBTOTAL' ? vigGoal.subtotalGoal : vigGoal.profitGoal;
        const actual = vigGoal.metric === 'SUBTOTAL' ? subtotal : profit;
        
        let vigRate = 1.5;
        
        if (year < 2025) {
          vigRate = 1.3;
        } else if ((u as any).constantVigEnabled && (u as any).constantVigValue !== null) {
          vigRate = (u as any).constantVigValue;
        } else if (vigGoal.manualVigRate !== null) {
          vigRate = vigGoal.manualVigRate;
        } else {
          const met = actual >= target;
          const isMontgomery = u.name && u.name.toLowerCase().includes("montgomery") && u.name.toLowerCase().includes("morgan");
          vigRate = isMontgomery ? 1.0 : (met ? 1.3 : 1.5);
        }
        
        repVigs[u.id] = { 
          metric: vigGoal.metric,
          target, 
          profitGoal: vigGoal.profitGoal,
          subtotalGoal: vigGoal.subtotalGoal,
          sales: actual, // for backward compatibility in UI
          profit,
          subtotal,
          vigRate,
          manualVigRate: vigGoal.manualVigRate
        }
      })

      historicalVigRates.push({
        monthKey,
        monthName,
        workdays,
        reps: repVigs
      })
    }

    const activeReps = Object.values(repStatsMap).filter((rep: any) => {
      if (rep.repId === unassignedId) {
        return rep.revenue > 0 || rep.totalDeals > 0
      }
      const lowerEmail = (rep.email || "").toLowerCase();
      // Exclude dummy/test accounts
      if (lowerEmail.includes('dummy') || lowerEmail.includes('example.com') || lowerEmail.includes('test_migration')) return false;

      // Filter by visibleReps if it exists
      if (!showHidden && visibleReps.length > 0) {
        return visibleReps.includes(rep.repId);
      }
      
      // Fallback: if visibleReps is empty or showHidden is true, only show those with actual activity (like before)
      return rep.revenue > 0 || rep.totalDeals > 0;
    }).sort((a: any, b: any) => b.revenue - a.revenue)

    // Calculate company totals & averages
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
        reps: activeReps,
        companyTotals,
        companyAverages,
        historicalVigRates,
        holidays,
        salesTargets
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
