import 'dotenv/config'
import { Handler } from "@netlify/functions"
import { getSystemSettings } from "./lib/settings"
import { prisma } from "./lib/prisma"

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
    if (day !== 0 && day !== 6) {
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
  const endDate = new Date(year, month + 1, 0);
  return getWorkdaysCount(startDate, endDate, holidays);
}

function getWorkdaysInWeek(date: Date, holidays: any[]): number {
  const monday = new Date(date);
  const day = monday.getDay();
  const diff = monday.getDate() - day + (day === 0 ? -6 : 1);
  monday.setDate(diff);
  monday.setHours(0,0,0,0);
  
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
    const params = event.queryStringParameters || {}
    const monthParam = params.month
    const dateParam = params.date
    const repIdFilter = params.repId || params.user || "all"
    const periodParam = params.period || "this_month"
    const customStartDate = params.startDate
    const customEndDate = params.endDate
    const checkOnly = params.checkOnly

    // ── checkOnly mode: returns count + latestUpdatedAt only ──────────────
    if (checkOnly === 'true') {
      const whereClause = repIdFilter !== "all" ? { account: { ownerId: repIdFilter } } : {}
      const [count, latest] = await Promise.all([
        prisma.invoice.count({ where: whereClause }),
        prisma.invoice.findFirst({ where: whereClause, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      ])
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, checkOnly: true, count, latestUpdatedAt: latest?.updatedAt ?? null })
      }
    }

    let now = new Date()
    let rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
    let rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

    if (periodParam === "all_time" || periodParam === "all") {
      rangeStart = new Date(2000, 0, 1, 0, 0, 0)
      rangeEnd = new Date(2099, 11, 31, 23, 59, 59, 999)
    } else if (customStartDate && customEndDate) {
      rangeStart = new Date(customStartDate + "T00:00:00.000Z")
      rangeEnd = new Date(customEndDate + "T23:59:59.999Z")
    } else if (periodParam === "today") {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0)
      rangeEnd = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59, 59, 999)
    } else if (periodParam === "this_week") {
      const mon = new Date(now)
      const day = mon.getDay()
      const diff = mon.getDate() - day + (day === 0 ? -6 : 1)
      mon.setDate(diff)
      mon.setHours(0,0,0,0)
      const sun = new Date(mon)
      sun.setDate(mon.getDate() + 6)
      sun.setHours(23,59,59,999)
      rangeStart = mon
      rangeEnd = sun
    } else if (periodParam === "this_month") {
      rangeStart = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0)
      rangeEnd = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)
    } else if (periodParam === "last_month") {
      rangeStart = new Date(now.getFullYear(), now.getMonth() - 1, 1, 0, 0, 0)
      rangeEnd = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59, 999)
    } else if (periodParam === "this_year") {
      rangeStart = new Date(now.getFullYear(), 0, 1, 0, 0, 0)
      rangeEnd = new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999)
    } else if (periodParam === "last_year") {
      rangeStart = new Date(now.getFullYear() - 1, 0, 1, 0, 0, 0)
      rangeEnd = new Date(now.getFullYear() - 1, 11, 31, 23, 59, 59, 999)
    } else if (monthParam && /^\d{4}-\d{2}$/.test(monthParam)) {
      const [yyyy, mm] = monthParam.split("-")
      rangeStart = new Date(parseInt(yyyy), parseInt(mm) - 1, 1, 0, 0, 0)
      rangeEnd = new Date(parseInt(yyyy), parseInt(mm), 0, 23, 59, 59, 999)
    } else if (dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam)) {
      const [yyyy, mm, dd] = dateParam.split("-")
      rangeStart = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), 0, 0, 0)
      rangeEnd = new Date(parseInt(yyyy), parseInt(mm) - 1, parseInt(dd), 23, 59, 59, 999)
    }

    const [
      settings,
      users,
      accounts,
      allInvoices,
      allSalesOrders
    ]: [any[], any[], any[], any[], any[]] = await Promise.all([
      prisma.systemSetting.findMany().catch(() => []),
      prisma.user.findMany({
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
          phone: true,
          title: true,
          role: true,
          constantVigEnabled: true,
          constantVigValue: true,
          payoutStructure: true
        },
        orderBy: { name: "asc" }
      }).catch(() => []),
      prisma.account.findMany({
        select: {
          id: true,
          name: true,
          ownerId: true,
          status: true
        }
      }).catch(() => []),
      prisma.invoice.findMany({
        where: {
          issueDate: {
            gte: rangeStart,
            lte: rangeEnd
          }
        },
        select: {
          id: true,
          zohoId: true,
          amount: true,
          status: true,
          issueDate: true,
          items: true,
          accountId: true,
          createdAt: true,
          account: {
            select: { id: true, name: true, ownerId: true, zohoId: true }
          }
        },
        orderBy: { issueDate: 'desc' }
      }).catch(() => []),
      prisma.salesOrder.findMany({
        where: {
          orderDate: {
            gte: rangeStart,
            lte: rangeEnd
          },
          // Only exclude voided and draft orders — invoiced SOs count as confirmed revenue
          NOT: {
            status: { in: ['Void', 'void', 'VOID', 'Draft', 'draft', 'DRAFT'] }
          }
        },
        select: {
          id: true,
          zohoId: true,
          amount: true,
          status: true,
          orderDate: true,
          items: true,
          accountId: true,
          createdAt: true,
          account: {
            select: { id: true, name: true, ownerId: true, zohoId: true }
          }
        },
        orderBy: { orderDate: 'desc' }
      }).catch(() => [])
    ])

    const userNameToIdMap: Record<string, string> = {}
    users.forEach(u => {
      if (u.name) {
        const normalized = u.name.replace(/\s+/g, ' ').trim().toLowerCase()
        userNameToIdMap[normalized] = u.id
      }
    })

    const addAlias = (alias: string, targetName: string) => {
      const targetUser = users.find(u => u.name?.toLowerCase().includes(targetName.toLowerCase()))
      if (targetUser) {
        userNameToIdMap[alias.toLowerCase().trim()] = targetUser.id
      }
    }

    addAlias("ricky griffin", "richard griffin")
    addAlias("ricky griffin ", "richard griffin")
    addAlias("monty morgan", "montgomery morgan")
    addAlias("ben bequette", "benjamin bequette")
    addAlias("justin  zastrow", "justin zastrow")
    const unassignedId = "unassigned"

    // Compute current week boundaries (Mon-Sun)
    const weekNow = new Date()
    const weekDay = weekNow.getDay()
    const weekMonday = new Date(weekNow)
    weekMonday.setDate(weekNow.getDate() - (weekDay === 0 ? 6 : weekDay - 1))
    weekMonday.setHours(0, 0, 0, 0)
    const weekSunday = new Date(weekMonday)
    weekSunday.setDate(weekMonday.getDate() + 6)
    weekSunday.setHours(23, 59, 59, 999)

    // Initialize repStatsMap
    const repStatsMap: Record<string, any> = {}
    
    users.forEach(u => {
      repStatsMap[u.id] = {
        repId: u.id,
        repName: u.name || u.email.split("@")[0],
        email: u.email,
        phone: u.phone || "",
        title: u.title || "Sales Representative",
        role: u.role,
        revenue: 0,
        weeklyRevenue: 0,
        profit: 0,
        deadProfit: 0,
        commissions: 0,
        invoiceCount: 0,
        salesOrderCount: 0,
        salesOrderSubtotal: 0,
        salesOrderDeadProfit: 0,
        salesOrderEstCommission: 0,
        invoices: [],
        salesOrders: []
      }
    })

    repStatsMap[unassignedId] = {
      repId: unassignedId,
      repName: "Unassigned",
      email: "",
      phone: "",
      title: "Unassigned Pool",
      role: "",
      revenue: 0,
      weeklyRevenue: 0,
      profit: 0,
      deadProfit: 0,
      commissions: 0,
      invoiceCount: 0,
      salesOrderCount: 0,
      salesOrderSubtotal: 0,
      salesOrderDeadProfit: 0,
      salesOrderEstCommission: 0,
      invoices: [],
      salesOrders: []
    }

    // Process Invoices in range
    allInvoices.forEach((inv: any) => {
      const items = inv.items as any || {}
      const cfs = items.custom_fields || []
      const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

      const amount = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount as any) || 0

      let deadCost = parseFloat(
        items.deadCostTotal || items.dead_cost_total || items.deadCost ||
        items.cf_dead_cost_total || items.cf_dead_cost_total_unformatted || 0
      )
      if ((isNaN(deadCost) || deadCost === 0) && lineItems.length > 0) {
        deadCost = lineItems.reduce((sum: number, li: any) => {
          const qty = parseFloat(li.quantity) || 1
          const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
          return sum + (qty * cost)
        }, 0)
      }
      if (isNaN(deadCost)) deadCost = 0

      const docDate = inv.issueDate ? new Date(inv.issueDate) : new Date()
      const year = docDate.getFullYear()
      const salespersonName = items.salesperson || ""
      const isMontgomery = salespersonName.toLowerCase().includes("montgomery") || salespersonName.toLowerCase().includes("morgan")
      const vigRate = (year <= 2024 || isMontgomery) ? (isMontgomery ? 1.0 : 1.3) : (parseFloat(items.cf_salesperson_vig ?? items.cf_salesperson_vig_unformatted) || 1.3)
      const deadCostPlusVig = (parseFloat(items.deadCostPlusVig || items.dead_cost_plus_vig || 0) || (deadCost * vigRate)) || 0

      const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find((c: any) => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0) || 0
      const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find((c: any) => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0) || 0
      
      const deadProfit = amount - deadCost - additionalCosts - ccFees
      const profit = amount - deadCostPlusVig - additionalCosts - ccFees

      const commission = (
        parseFloat(items.commission) ||
        parseFloat(items.cf_commission_amount_unformatted) ||
        parseFloat(items.cf_commision_amount_unformatted) ||
        (profit * 0.50)
      ) || 0

      let repId = unassignedId
      if (salespersonName) {
        const normalized = salespersonName.replace(/\s+/g, ' ').trim().toLowerCase()
        const matchedId = userNameToIdMap[normalized] || userNameToIdMap[salespersonName.toLowerCase().trim()]
        if (matchedId) repId = matchedId
      }
      if (repId === unassignedId) {
        repId = inv.account?.ownerId || unassignedId
      }

      const invStatusLower = (inv.status || '').toLowerCase()
      if (repStatsMap[repId] && invStatusLower !== 'void' && invStatusLower !== 'draft') {
        repStatsMap[repId].revenue += amount
        repStatsMap[repId].profit += profit
        repStatsMap[repId].deadProfit += deadProfit
        repStatsMap[repId].commissions += commission
        repStatsMap[repId].invoiceCount++
        // Track weekly revenue (always based on current week, regardless of period filter)
        const invDateForWeek = inv.issueDate ? new Date(inv.issueDate) : null
        if (invDateForWeek && invDateForWeek >= weekMonday && invDateForWeek <= weekSunday) {
          repStatsMap[repId].weeklyRevenue += amount
        }
        repStatsMap[repId].invoices.push({
          id: inv.id,
          zohoId: inv.zohoId,
          accountZohoId: inv.account?.zohoId || null,
          invoiceNumber: items.invoiceNumber || items.invoice_number || inv.zohoId || inv.id,
          date: inv.issueDate || inv.createdAt,
          customerName: inv.account?.name || "Unknown Customer",
          repName: repStatsMap[repId]?.repName || "",
          subtotal: amount,
          deadProfit: deadProfit,
          profit: profit,
          commission: commission,
          status: inv.status || "Paid"
        })
      }
    })

    // Process Sales Orders in range
    allSalesOrders.forEach((so: any) => {
      const items = so.items as any || {}
      const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

      const amount = parseFloat(items.sub_total || items.subTotal) || parseFloat(so.amount as any) || 0

      let deadCost = parseFloat(
        items.deadCostTotal || items.dead_cost_total || items.deadCost || 0
      )
      if ((isNaN(deadCost) || deadCost === 0) && lineItems.length > 0) {
        deadCost = lineItems.reduce((sum: number, li: any) => {
          const qty = parseFloat(li.quantity) || 1
          const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
          return sum + (qty * cost)
        }, 0)
      }
      if (isNaN(deadCost)) deadCost = 0

      const deadProfit = amount - deadCost
      const estCommission = deadProfit * 0.50
      const salespersonName = items.salesperson || ""

      let repId = unassignedId
      if (salespersonName) {
        const normalized = salespersonName.replace(/\s+/g, ' ').trim().toLowerCase()
        const matchedId = userNameToIdMap[normalized] || userNameToIdMap[salespersonName.toLowerCase().trim()]
        if (matchedId) repId = matchedId
      }
      if (repId === unassignedId) {
        repId = so.account?.ownerId || unassignedId
      }

      const soStatusLower = (so.status || '').toLowerCase()
      if (repStatsMap[repId] && soStatusLower !== 'void' && soStatusLower !== 'draft') {
        repStatsMap[repId].salesOrderCount++
        repStatsMap[repId].salesOrderSubtotal += amount
        repStatsMap[repId].salesOrderDeadProfit += deadProfit
        repStatsMap[repId].salesOrderEstCommission += estCommission
        repStatsMap[repId].salesOrders.push({
          id: so.id,
          zohoId: so.zohoId,
          accountZohoId: so.account?.zohoId || null,
          salesOrderNumber: items.salesorder_number || items.salesOrderNumber || so.zohoId || so.id,
          date: so.orderDate || so.createdAt,
          customerName: so.account?.name || items.customer_name || "Unknown Customer",
          repName: repStatsMap[repId]?.repName || "",
          subtotal: amount,
          deadProfit: deadProfit,
          estCommission: estCommission,
          status: so.status || "Confirmed"
        })
      }
    })

    const aliasGroups = [
      ["richard", "ricky", "rick", "griffin"],
      ["montgomery", "monty", "morgan"],
      ["benjamin", "ben", "bequette"],
      ["robert", "bobby", "salyers"],
      ["ross", "haisler"],
      ["brian", "basiliere"],
      ["justin", "zastrow"],
      ["jeff", "black"],
      ["shane", "criswell"],
      ["paul", "gencuski"]
    ]

    const isRepMatch = (r: any, filterStr: string): boolean => {
      if (!filterStr || filterStr === "all" || filterStr === "ALL") return true
      const f = filterStr.trim().toLowerCase()
      if (!f) return true

      // Direct ID or Email match
      if (r.repId && r.repId.toLowerCase() === f) return true
      if (r.email && r.email.toLowerCase() === f) return true
      if (r.email && r.email.toLowerCase().startsWith(f)) return true

      // Name comparison
      const rName = (r.repName || "").toLowerCase().trim()
      if (rName === f || rName.includes(f) || f.includes(rName)) return true

      // Token matching
      const filterTokens = f.split(/\s+/).filter(Boolean)
      const nameTokens = rName.split(/\s+/).filter(Boolean)
      for (const ft of filterTokens) {
        if (ft.length >= 3 && nameTokens.some((nt: string) => nt === ft || nt.startsWith(ft) || ft.startsWith(nt))) {
          return true
        }
      }

      // Alias group matching
      for (const group of aliasGroups) {
        const filterInGroup = group.some(g => f.includes(g))
        const nameInGroup = group.some(g => rName.includes(g) || (r.email && r.email.toLowerCase().includes(g)))
        if (filterInGroup && nameInGroup) return true
      }

      return false
    }

    let repsList = Object.values(repStatsMap).filter((r: any) => r.repId !== unassignedId || r.invoices.length > 0 || r.salesOrders.length > 0)
    
    if (repIdFilter !== "all") {
      repsList = repsList.filter((r: any) => isRepMatch(r, repIdFilter))
    }

    let totalInvoiceCount = 0
    let totalInvoiceSubtotal = 0
    let totalInvoiceWeeklyRevenue = 0
    let totalInvoiceDeadProfit = 0
    let totalInvoiceNetProfit = 0
    let totalInvoiceCommission = 0

    let totalSalesOrderCount = 0
    let totalSalesOrderSubtotal = 0
    let totalSalesOrderDeadProfit = 0
    let totalSalesOrderEstCommission = 0

    repsList.forEach((r: any) => {
      totalInvoiceCount += r.invoiceCount
      totalInvoiceSubtotal += r.revenue
      totalInvoiceWeeklyRevenue += r.weeklyRevenue || 0
      totalInvoiceDeadProfit += r.deadProfit
      totalInvoiceNetProfit += r.profit
      totalInvoiceCommission += r.commissions

      totalSalesOrderCount += r.salesOrderCount
      totalSalesOrderSubtotal += r.salesOrderSubtotal
      totalSalesOrderDeadProfit += r.salesOrderDeadProfit
      totalSalesOrderEstCommission += r.salesOrderEstCommission
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        period: periodParam,
        dateRange: {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString()
        },
        reps: repsList,
        totals: {
          invoiceCount: totalInvoiceCount,
          invoiceSubtotal: totalInvoiceSubtotal,
          invoiceWeeklyRevenue: totalInvoiceWeeklyRevenue,
          invoiceDeadProfit: totalInvoiceDeadProfit,
          invoiceNetProfit: totalInvoiceNetProfit,
          invoiceCommission: totalInvoiceCommission,
          salesOrderCount: totalSalesOrderCount,
          salesOrderSubtotal: totalSalesOrderSubtotal,
          salesOrderDeadProfit: totalSalesOrderDeadProfit,
          salesOrderEstCommission: totalSalesOrderEstCommission
        }
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
