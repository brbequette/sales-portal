import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma, Prisma } from "./lib/prisma"
import { financialNumber, headerCommission } from "../../src/lib/global-header-metrics"
import { isAdminRole } from "../../src/lib/roles"

function hasStoredCommission(items: Record<string, unknown>): boolean {
  return [items.salesCommission, items.commission, items.cf_commission_amount, items.cf_commision_amount, items.cf_commission_amount_unformatted]
    .some(value => value !== undefined && value !== null && value !== '')
}

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Cache-Control": "private, no-store, max-age=0, must-revalidate",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  let authenticatedUser: Awaited<ReturnType<typeof authenticateFunction>>
  try {
    authenticatedUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  try {
    const params = event.queryStringParameters || {}
    const monthParam = params.month
    const dateParam = params.date
    let repIdFilter = params.repId || params.user || "all"
    const privileged = isAdminRole(authenticatedUser.role)
    const authenticatedRepId = authenticatedUser.dbId || authenticatedUser.userId
    if (!privileged && repIdFilter !== "all" && repIdFilter !== authenticatedRepId) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "Forbidden" }) }
    }
    // Sales reps may see their own detailed records only. Company-level totals
    // are exposed by the aggregate dashboard endpoint without leaking peer data.
    if (!privileged) repIdFilter = authenticatedRepId
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

    // BUG-003 fix: fetch vig_settings alongside other data so we can replicate
    // the full VIG resolution chain (constantVigEnabled → monthlyVigGoal → doc field → 1.3)
    // PERF: invoices and salesOrders now use $queryRaw — extracts only needed JSON keys
    //       at the DB layer instead of hydrating the entire items blob in JS.
    //       Also reads new computedProfit/deadProfit columns when available (post-migration).
    const soExcludedStatuses = ['Void','void','VOID','Draft','draft','DRAFT','Cancelled','cancelled','CANCELLED','Invoiced','invoiced','INVOICED','Converted','converted','CONVERTED']
    const soExcludedSql = Prisma.sql`AND s.status NOT IN (${Prisma.join(soExcludedStatuses)})`
    const requestedRep = repIdFilter !== 'all'
      ? await prisma.user.findFirst({
          where: { OR: [{ id: repIdFilter }, { email: { equals: repIdFilter, mode: 'insensitive' } }, { name: { equals: repIdFilter, mode: 'insensitive' } }] },
          select: { id: true, name: true },
        })
      : null
    if (requestedRep) repIdFilter = requestedRep.id
    const invoiceRepFilterSql = requestedRep
      ? Prisma.sql`AND (a."ownerId" = ${requestedRep.id} OR LOWER(TRIM(COALESCE(i."computedSalesperson", ''))) = LOWER(${requestedRep.name}) OR LOWER(TRIM(COALESCE(i.items->>'salesperson', ''))) = LOWER(${requestedRep.name}))`
      : repIdFilter !== 'all' ? Prisma.sql`AND a."ownerId" = ${repIdFilter}` : Prisma.empty
    const salesOrderRepFilterSql = requestedRep
      ? Prisma.sql`AND (a."ownerId" = ${requestedRep.id} OR LOWER(TRIM(COALESCE(s.items->>'salesperson', ''))) = LOWER(${requestedRep.name}))`
      : repIdFilter !== 'all' ? Prisma.sql`AND a."ownerId" = ${repIdFilter}` : Prisma.empty

    const [
      users,
      allInvoices,
      allSalesOrders
    ]: [any[], any[], any[]] = await Promise.all([
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

      // PERF: $queryRaw — extracts only the scalar JSON keys needed for calc.
      // Reads computedProfit/deadProfit columns first when populated (fast path).
      // Falls back to JSON key extraction for legacy rows.
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          i.id::text,
          i."zohoId",
          i.amount,
          i.status,
          i."issueDate",
          i."createdAt",
          a.id::text          AS "accountId",
          a.name              AS "accountName",
          a."ownerId"         AS "accountOwnerId",
          a."zohoId"          AS "accountZohoId",
          -- Fast path: pre-computed scalar columns (NULL for legacy rows)
          i."computedProfit"        AS "computedProfit",
          i."computedDeadProfit"    AS "computedDeadProfit",
          i."computedDeadCost"      AS "computedDeadCost",
          i."computedVigRate"       AS "computedVigRate",
          i."computedSalesperson"   AS "computedSalesperson",
          i."computedInvoiceNumber" AS "computedInvoiceNumber",
          i."computedUpfront"       AS "computedUpfront",
          i."computedFinal"         AS "computedFinal",
          -- Fallback: extract only the scalar JSON fields we actually need
          jsonb_build_object(
            'salesperson',            i.items->>'salesperson',
            'invoiceNumber',          i.items->>'invoiceNumber',
            'invoice_number',         i.items->>'invoice_number',
            'sub_total',              i.items->>'sub_total',
            'subTotal',               i.items->>'subTotal',
            'deadCostTotal',          i.items->>'deadCostTotal',
            'dead_cost_total',        i.items->>'dead_cost_total',
            'deadCostPlusVig',        i.items->>'deadCostPlusVig',
            'deadCostSubjectToVig',   i.items->>'deadCostSubjectToVig',
            'deadCostNoVig',          i.items->>'deadCostNoVig',
            'cf_salesperson_vig',     i.items->>'cf_salesperson_vig',
            'cf_salesperson_vig_unformatted', i.items->>'cf_salesperson_vig_unformatted',
            'additionalCosts',        i.items->>'additionalCosts',
            'additional_costs',       i.items->>'additional_costs',
            'ccFees',                 i.items->>'ccFees',
            'cc_fees',                i.items->>'cc_fees',
            'gifts',                  i.items->>'gifts',
            'gifts_cost',             i.items->>'gifts_cost',
            'profit',                 i.items->>'profit',
            'commission',             i.items->>'commission',
            'salesCommission',        i.items->>'salesCommission',
            'cf_commission_amount',   i.items->>'cf_commission_amount',
            'cf_commision_amount',    i.items->>'cf_commision_amount',
            'cf_commission_amount_unformatted', i.items->>'cf_commission_amount_unformatted'
          ) AS items
        FROM "Invoice" i
        JOIN "Account" a ON a.id = i."accountId"
        WHERE i."issueDate" >= ${rangeStart} AND i."issueDate" <= ${rangeEnd}
          AND lower(i.status) NOT IN ('void','voided','draft','written_off','writeoff','write_off','written off','bad debt')
          ${invoiceRepFilterSql}
        ORDER BY i."issueDate" DESC
      `).catch(() => []),

      // PERF: $queryRaw for SalesOrders — same pattern
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          s.id::text,
          s."zohoId",
          s.amount,
          s.status,
          s."orderDate",
          s."createdAt",
          a.id::text   AS "accountId",
          a.name       AS "accountName",
          a."ownerId"  AS "accountOwnerId",
          a."zohoId"   AS "accountZohoId",
          jsonb_build_object(
            'salesperson',     s.items->>'salesperson',
            'salesorder_number', s.items->>'salesorder_number',
            'salesOrderNumber',  s.items->>'salesOrderNumber',
            'customer_name',   s.items->>'customer_name',
            'sub_total',       s.items->>'sub_total',
            'subTotal',        s.items->>'subTotal',
            'deadCostTotal',   s.items->>'deadCostTotal',
            'dead_cost_total', s.items->>'dead_cost_total',
            'deadProfitActual', s.items->>'deadProfitActual',
            'profit',          s.items->>'profit',
            'commission',      s.items->>'commission',
            'salesCommission', s.items->>'salesCommission',
            'cf_commission_amount', s.items->>'cf_commission_amount',
            'cf_commision_amount', s.items->>'cf_commision_amount',
            'cf_commission_amount_unformatted', s.items->>'cf_commission_amount_unformatted',
            'additionalCosts', s.items->>'additionalCosts',
            'gifts',           s.items->>'gifts',
            'gifts_cost',      s.items->>'gifts_cost',
            'ccFees',          s.items->>'ccFees',
            'cc_fees',         s.items->>'cc_fees'
          ) AS items
        FROM "SalesOrder" s
        JOIN "Account" a ON a.id = s."accountId"
        WHERE s."orderDate" >= ${rangeStart} AND s."orderDate" <= ${rangeEnd}
          ${soExcludedSql}
          AND NOT EXISTS (
            SELECT 1 FROM "Invoice" linked
            WHERE (
              NULLIF(lower(s."zohoId"), '') IS NOT NULL
              AND lower(s."zohoId") IN (
                lower(COALESCE(linked."salesOrderZohoId", '')),
                lower(COALESCE(linked.items->>'salesorder_id', '')),
                lower(COALESCE(linked.items->>'sales_order_id', ''))
              )
            ) OR (
              NULLIF(lower(COALESCE(s.items->>'salesorder_number', s.items->>'salesOrderNumber', '')), '') IS NOT NULL
              AND lower(COALESCE(s.items->>'salesorder_number', s.items->>'salesOrderNumber', '')) IN (
                lower(COALESCE(linked."salesorderNumber", '')),
                lower(COALESCE(linked.items->>'salesorder_number', '')),
                lower(COALESCE(linked.items->>'salesOrderNumber', ''))
              )
            )
          )
          ${salesOrderRepFilterSql}
        ORDER BY s."orderDate" DESC
      `).catch(() => [])
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
    // PERF: inv now comes from $queryRaw — items is a plain scalar JSON object,
    //       no line_items array. Uses computedProfit/deadProfit columns when available.
    allInvoices.forEach((inv: any) => {
      const items = inv.items as any || {}
      const amount = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount as any) || 0

      // ── FAST PATH: use pre-computed scalar columns when available ──────────
      const hasComputed = inv.computedProfit !== null && inv.computedProfit !== undefined
        && inv.computedDeadProfit !== null && inv.computedDeadProfit !== undefined
        && inv.computedDeadCost !== null && inv.computedDeadCost !== undefined
        && hasStoredCommission(items)
      let profit: number, deadProfit: number, commission: number
      let salespersonName: string
      let matchedUserId: string | null = null

      if (hasComputed) {
        profit      = parseFloat(inv.computedProfit)     || 0
        deadProfit  = parseFloat(inv.computedDeadProfit) || 0
        commission = headerCommission(items)
        salespersonName = inv.computedSalesperson || items.salesperson || ''
      } else {
        // Missing authoritative stored costs fail closed. Financial reads do not
        // invent cost, profit, VIG, or commission values.
        salespersonName = items.salesperson || ''
        profit = 0
        deadProfit = 0
        commission = 0
      }

      // Resolve repId from salesperson name or account owner
      if (!matchedUserId && salespersonName) {
        const normalized = salespersonName.replace(/\s+/g, ' ').trim().toLowerCase()
        matchedUserId = userNameToIdMap[normalized] || userNameToIdMap[salespersonName.toLowerCase().trim()] || null
      }
      if (!matchedUserId) matchedUserId = inv.accountOwnerId || null
      const repId = matchedUserId || unassignedId

      const invStatusLower = (inv.status || '').toLowerCase()
      if (repStatsMap[repId] && invStatusLower !== 'void' && invStatusLower !== 'draft') {
        repStatsMap[repId].revenue    += amount
        repStatsMap[repId].profit     += profit
        repStatsMap[repId].deadProfit += deadProfit
        repStatsMap[repId].commissions += commission
        repStatsMap[repId].invoiceCount++
        const invDateForWeek = inv.issueDate ? new Date(inv.issueDate) : null
        if (invDateForWeek && invDateForWeek >= weekMonday && invDateForWeek <= weekSunday) {
          repStatsMap[repId].weeklyRevenue += amount
        }
        repStatsMap[repId].invoices.push({
          id: inv.id,
          zohoId: inv.zohoId,
          accountZohoId: inv.accountZohoId || null,
          invoiceNumber: inv.computedInvoiceNumber || items.invoiceNumber || items.invoice_number || inv.zohoId || inv.id,
          date: inv.issueDate || inv.createdAt,
          customerName: inv.accountName || 'Unknown Customer',
          repName: repStatsMap[repId]?.repName || '',
          subtotal: amount,
          deadProfit,
          profit,
          commission,
          costQuality: hasComputed ? 'AUTHORITATIVE_STORED' : 'BLOCKED_MISSING_COST',
          status: inv.status || 'Paid'
        })
      }
    })

    // Process Sales Orders in range
    // PERF: so now comes from $queryRaw — items is a scalar JSON object (no line_items)
    allSalesOrders.forEach((so: any) => {
      const items = so.items as any || {}
      const amount = parseFloat(items.sub_total || items.subTotal) || parseFloat(so.amount as any) || 0

      const costReady = items.deadCostTotal != null && items.deadProfitActual != null && items.profit != null && hasStoredCommission(items)
      const salespersonName = items.salesperson || ''

      // NEW-002 fix: resolve rep and apply VIG rate to SO (same as invoice loop above)
      let repId = unassignedId
      if (salespersonName) {
        const normalized = salespersonName.replace(/\s+/g, ' ').trim().toLowerCase()
        const matchedId = userNameToIdMap[normalized] || userNameToIdMap[salespersonName.toLowerCase().trim()]
        if (matchedId) repId = matchedId
      }
      if (repId === unassignedId) repId = so.accountOwnerId || unassignedId

      const deadProfit    = costReady ? financialNumber(items.deadProfitActual) : 0
      const profit        = costReady ? financialNumber(items.profit) : 0
      const estCommission = costReady ? headerCommission(items) : 0

      const soStatusLower = (so.status || '').toLowerCase()
      if (repStatsMap[repId] && soStatusLower !== 'void' && soStatusLower !== 'draft') {
        repStatsMap[repId].salesOrderCount++
        repStatsMap[repId].salesOrderSubtotal += amount
        repStatsMap[repId].salesOrderDeadProfit += deadProfit
        repStatsMap[repId].salesOrderEstCommission += estCommission
        repStatsMap[repId].salesOrders.push({
          id: so.id,
          zohoId: so.zohoId,
          accountZohoId: so.accountZohoId || null,
          salesOrderNumber: items.salesorder_number || items.salesOrderNumber || so.zohoId || so.id,
          date: so.orderDate || so.createdAt,
          customerName: so.accountName || items.customer_name || "Unknown Customer",
          repName: repStatsMap[repId]?.repName || "",
          subtotal: amount,
          deadProfit: deadProfit,
          estCommission: estCommission,
          profit,
          costQuality: costReady ? 'AUTHORITATIVE_STORED' : 'BLOCKED_MISSING_COST',
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

    const visibleReps = privileged
      ? repsList
      : repsList.filter((r: any) => r.repId === authenticatedRepId)

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        scope: repIdFilter === 'all' ? 'company' : 'personal',
        period: periodParam,
        dateRange: {
          start: rangeStart.toISOString(),
          end: rangeEnd.toISOString()
        },
        reps: visibleReps,
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
          salesOrderEstCommission: totalSalesOrderEstCommission,
          mtdSales: totalInvoiceSubtotal + totalSalesOrderSubtotal,
          mtdProfit: totalInvoiceNetProfit + repsList.reduce((sum: number, rep: any) => sum + (rep.salesOrders || []).reduce((inner: number, order: any) => inner + (order.profit || 0), 0), 0),
          mtdCommission: totalInvoiceCommission + totalSalesOrderEstCommission,
          qualityBlockedCount: repsList.reduce((sum: number, rep: any) => sum
            + (rep.invoices || []).filter((doc: any) => doc.costQuality !== 'AUTHORITATIVE_STORED').length
            + (rep.salesOrders || []).filter((doc: any) => doc.costQuality !== 'AUTHORITATIVE_STORED').length, 0)
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

export const handler = authenticatedHandler
