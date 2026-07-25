import { Handler } from "@netlify/functions"
import { PrismaClient, Prisma } from "@prisma/client"

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
    // --- Batch all queries concurrently in a single Promise.all trip ---
    let payoutWhere: any = repId ? { repId } : {}
    if (targetYear && targetYear !== 'all' && !isNaN(parseInt(targetYear))) {
      const payoutStart = new Date(`${targetYear}-01-01`)
      const payoutEnd = new Date(`${parseInt(targetYear) + 1}-01-01`)
      payoutWhere.date = { gte: payoutStart, lt: payoutEnd }
    }

    // Build date filter fragments for raw queries
    const invDateSql = targetYear !== 'all'
      ? Prisma.sql`AND i."issueDate" >= ${new Date(`${targetYear}-01-01`)} AND i."issueDate" < ${new Date(`${parseInt(targetYear)+1}-01-01`)}`
      : Prisma.empty
    const soDateSql = targetYear !== 'all'
      ? Prisma.sql`AND s."orderDate" >= ${new Date(`${targetYear}-01-01`)} AND s."orderDate" < ${new Date(`${parseInt(targetYear)+1}-01-01`)}`
      : Prisma.empty

    const [
      rawInvoicesRaw,
      rawSalesOrdersRaw,
      deals,
      rawUsers,
      visibleRepsSetting,
      collectionsManagerSetting,
      payouts,
      allVigGoals,
      allVigUsers
    ]: [any[], any[], any[], any[], any, any, any[], any[], any[]] = await Promise.all([
      // Use $queryRaw to extract ONLY the scalar fields needed for commission calc.
      // This avoids fetching huge line_items/custom_fields arrays stored by bulk-sync,
      // which were causing Netlify function timeouts (response truncated mid-stream).
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          i.id::text,
          i."zohoId",
          i.amount,
          i.status,
          i."issueDate",
          i."createdAt",
          a.name    AS "accountName",
          a."zohoId" AS "accountZohoId",
          jsonb_build_object(
            'salesperson',                i.items->>'salesperson',
            'invoiceNumber',              i.items->>'invoiceNumber',
            'invoice_number',             i.items->>'invoice_number',
            'sub_total',                  i.items->>'sub_total',
            'subTotal',                   i.items->>'subTotal',
            'deadCostTotal',              i.items->>'deadCostTotal',
            'dead_cost_total',            i.items->>'dead_cost_total',
            'cf_dead_cost_total',         i.items->>'cf_dead_cost_total',
            'deadCostPlusVig',            i.items->>'deadCostPlusVig',
            'cf_salesperson_vig',         i.items->>'cf_salesperson_vig',
            'cf_salesperson_vig_unformatted', i.items->>'cf_salesperson_vig_unformatted',
            'paymentDate',               i.items->>'paymentDate',
            'ccFees',                    i.items->>'ccFees',
            'cc_fees',                   i.items->>'cc_fees',
            'additionalCosts',           i.items->>'additionalCosts',
            'additional_costs',          i.items->>'additional_costs',
            'gifts',                     i.items->>'gifts',
            'gifts_cost',                i.items->>'gifts_cost',
            'giftCost',                  i.items->>'giftCost',
            'balance',                   i.items->>'balance',
            'profit',                    i.items->>'profit',
            'vigRate',                   i.items->>'vigRate'
          ) AS items
        FROM "Invoice" i
        LEFT JOIN "Account" a ON a.id = i."accountId"
        WHERE i.status NOT IN ('Void','void','Draft','draft')
        ${invDateSql}
        ORDER BY i."issueDate" DESC NULLS LAST
      `).catch(() => []),
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          s.id::text,
          s."zohoId",
          s.amount,
          s.status,
          s."orderDate",
          s."createdAt",
          a.name     AS "accountName",
          a."zohoId"  AS "accountZohoId",
          jsonb_build_object(
            'salesperson',            s.items->>'salesperson',
            'salesorder_number',      s.items->>'salesorder_number',
            'salesorderNumber',       s.items->>'salesorderNumber',
            'sub_total',              s.items->>'sub_total',
            'subTotal',               s.items->>'subTotal',
            'deadCostTotal',          s.items->>'deadCostTotal',
            'dead_cost_total',        s.items->>'dead_cost_total',
            'cf_dead_cost_total',     s.items->>'cf_dead_cost_total',
            'deadCostPlusVig',        s.items->>'deadCostPlusVig',
            'cf_salesperson_vig',     s.items->>'cf_salesperson_vig',
            'cf_salesperson_vig_unformatted', s.items->>'cf_salesperson_vig_unformatted',
            'paymentDate',            s.items->>'paymentDate',
            'ccFees',                 s.items->>'ccFees',
            'cc_fees',                s.items->>'cc_fees',
            'additionalCosts',        s.items->>'additionalCosts',
            'additional_costs',       s.items->>'additional_costs',
            'gifts',                  s.items->>'gifts',
            'gifts_cost',             s.items->>'gifts_cost',
            'giftCost',               s.items->>'giftCost',
            'balance',                s.items->>'balance',
            'profit',                 s.items->>'profit',
            'vigRate',                s.items->>'vigRate'
          ) AS items
        FROM "SalesOrder" s
        LEFT JOIN "Account" a ON a.id = s."accountId"
        WHERE s.status NOT IN ('Void','void','Draft','draft','Cancelled','cancelled','Invoiced','invoiced','Converted','converted')
        ${soDateSql}
        ORDER BY s."orderDate" DESC NULLS LAST
      `).catch(() => []),
      prisma.deal.findMany({
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
      }).catch(() => []),
      prisma.user.findMany({
        select: { id: true, name: true, email: true, role: true },
        orderBy: { name: "asc" }
      }).catch(() => []),
      prisma.systemSetting.findUnique({ where: { key: "visible_reps" } }).catch(() => null),
      prisma.systemSetting.findUnique({ where: { key: "collections_manager_id" } }).catch(() => null),
      prisma.payout.findMany({
        where: payoutWhere,
        orderBy: { date: "desc" }
      }).catch(() => []),
      // Fetch all monthly VIG goals to resolve correct VIG rate per rep/month
      prisma.monthlyVigGoal.findMany({
        select: { repId: true, monthKey: true, manualVigRate: true, lastSyncedVigRate: true }
      }).catch(() => []),
      // Fetch all users with VIG override settings
      prisma.user.findMany({
        select: { id: true, name: true, constantVigEnabled: true, constantVigValue: true }
      }).catch(() => [])
    ])

    const visibleReps: string[] = JSON.parse(visibleRepsSetting?.value || "[]")
    const collectionsManagerId = collectionsManagerSetting?.value || null
    let users = rawUsers
    if (!showHidden && !repId && visibleReps.length > 0) {
      users = users.filter(u => visibleReps.includes(u.id))
    }

    // Add .account compat shim so existing calc code works unchanged
    const rawInvoices = rawInvoicesRaw.map((row: any) => ({
      ...row,
      issueDate: row.issueDate ? new Date(row.issueDate) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      amount: row.amount != null ? parseFloat(row.amount) : 0,
      account: { name: row.accountName || null, zohoId: row.accountZohoId || null }
    }))
    const rawSalesOrders = rawSalesOrdersRaw.map((row: any) => ({
      ...row,
      orderDate: row.orderDate ? new Date(row.orderDate) : null,
      createdAt: row.createdAt ? new Date(row.createdAt) : new Date(),
      amount: row.amount != null ? parseFloat(row.amount) : 0,
      account: { name: row.accountName || null, zohoId: row.accountZohoId || null }
    }))

    // ── VIG Rate Resolution Helpers ─────────────────────────────────────
    // Build lookup: repId -> Map<monthKey, vigRate>
    const vigGoalMap = new Map<string, Map<string, number>>()
    for (const goal of allVigGoals) {
      const rate = goal.manualVigRate ?? goal.lastSyncedVigRate
      if (rate != null && !isNaN(rate)) {
        if (!vigGoalMap.has(goal.repId)) vigGoalMap.set(goal.repId, new Map())
        vigGoalMap.get(goal.repId)!.set(goal.monthKey, rate)
      }
    }
    // Build lookup: repId -> constant vig override
    const vigUserMap = new Map<string, { constantVigEnabled: boolean; constantVigValue: number | null }>()
    for (const u of allVigUsers) {
      vigUserMap.set(u.id, { constantVigEnabled: !!u.constantVigEnabled, constantVigValue: u.constantVigValue ?? null })
    }
    // Build reverse lookup: salesperson name (lowercase) -> userId
    const nameToUserId = new Map<string, string>()
    for (const u of allVigUsers) {
      if (u.name) nameToUserId.set(u.name.toLowerCase().trim(), u.id)
    }

    /**
     * Resolve the correct VIG rate for a rep on a given invoice date.
     * Priority:
     *   1. cf_salesperson_vig field stored on the invoice (set by sync-vig-to-zoho)
     *   2. User's constant VIG override (constantVigEnabled + constantVigValue)
     *   3. MonthlyVigGoal for that rep's month
     *   4. Default 1.3 (company baseline)
     */
    function resolveVigRate(
      salespersonName: string | null,
      matchedRepId: string | null,
      docDate: Date,
      rawVigField: any,
      isMontgomery: boolean
    ): number {
      // Montgomery always 1.0
      if (isMontgomery) return 1.0

      // Historical: pre-2025 everyone was 1.3
      if (docDate.getFullYear() <= 2024) return 1.3

      // 1. Try reading cf_salesperson_vig from the invoice JSON
      const fieldVal = parseFloat(rawVigField)
      if (!isNaN(fieldVal) && fieldVal >= 1.0) return fieldVal

      // 2. Constant VIG override on the user record
      if (matchedRepId) {
        const userVig = vigUserMap.get(matchedRepId)
        if (userVig?.constantVigEnabled && userVig.constantVigValue != null && !isNaN(userVig.constantVigValue)) {
          return userVig.constantVigValue
        }

        // 3. MonthlyVigGoal for the month this invoice was issued
        const monthKey = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`
        const monthlyRate = vigGoalMap.get(matchedRepId)?.get(monthKey)
        if (monthlyRate != null && !isNaN(monthlyRate) && monthlyRate >= 1.0) return monthlyRate
      }

      // 4. Default baseline
      return 1.3
    }

    // Deduplicate by invoiceNumber
    const seenInvoiceNumbers = new Map<string, (typeof rawInvoices)[0]>()
    const invoicesWithoutNumber: (typeof rawInvoices) = []
    
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
        const isBetter = invProfit > existProfit || (invProfit === existProfit && (inv.amount || 0) > (existing.amount || 0))
        if (isBetter) {
          seenInvoiceNumbers.set(num, inv)
        }
      }
    }
    
    const invoices = [...Array.from(seenInvoiceNumbers.values()), ...invoicesWithoutNumber]

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

      // Dead cost: try all known Zoho field name variants, then fall back to line item costs, then 50% estimate
      let deadCost = parseFloat(
        items.deadCostTotal || items.dead_cost_total || items.deadCost ||
        items.cf_dead_cost_total || items.cf_dead_cost_total_unformatted ||
        items.total_dead_cost || 0
      )
      if ((isNaN(deadCost) || deadCost === 0) && lineItems.length > 0) {
        deadCost = lineItems.reduce((sum: number, li: any) => {
          const qty = parseFloat(li.quantity) || 1
          const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
          return sum + (qty * cost)
        }, 0)
      }
      if ((isNaN(deadCost) || deadCost === 0) && subTotal > 0) {
        deadCost = subTotal * 0.50
      }
      if (isNaN(deadCost)) deadCost = 0

      // Use issueDate for VIG rate resolution (prefer issueDate, fall back to createdAt)
      const docDate = inv.issueDate ? new Date(inv.issueDate) : (inv.createdAt ? new Date(inv.createdAt) : (items.date ? new Date(items.date) : new Date()))
      const isMontgomery = salespersonName?.toLowerCase().includes("montgomery") || salespersonName?.toLowerCase().includes("morgan")

      const matchedRep = salespersonName ? userByName.get(salespersonName.toLowerCase().trim()) : null
      const matchedRepId = matchedRep?.id || (salespersonName ? nameToUserId.get(salespersonName.toLowerCase().trim()) : null) || null

      // VIG Rate: resolved from cf_salesperson_vig on invoice → user constant → MonthlyVigGoal → 1.3 default
      // cf_salesperson_vig is the Zoho custom field pushed by sync-vig-to-zoho
      const vigRate = resolveVigRate(
        salespersonName,
        matchedRepId,
        docDate,
        items.cf_salesperson_vig ?? items.cf_salesperson_vig_unformatted,
        !!isMontgomery
      )
      const deadCostPlusVig = deadCost * vigRate

      const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find((c: any) => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0) || 0
      const giftsCost = parseFloat(items.gifts || items.gifts_cost || items.giftCost || cfs.find((c: any) => (c.label || '').toUpperCase().includes('GIFT'))?.value || 0) || 0
      const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find((c: any) => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0) || 0

      // 1. Initial Estimated Profit (no CC fees — used for upfront commission calc)
      const initialProfit = subTotal - deadCostPlusVig - additionalCosts - giftsCost

      // 2. Final Net Profit after VIG, gifts, additional costs & end CC fees (commission base)
      const profit = subTotal - deadCostPlusVig - additionalCosts - giftsCost - ccFees

      // 3. Dead Profit = raw markup for Sales Goals (no VIG multiplier)
      const deadProfit = subTotal - deadCost - additionalCosts - giftsCost - ccFees

      const isPaid = FINAL_PAID_STATUSES.has(inv.status)

      // 4. Two-Stage 50/50 Commission (after-VIG profit basis):
      //    - Upfront (25% of initialProfit): earned on invoice creation
      //    - Final  (25% of profit, adjusted): earned when invoice is paid
      const safeInitialProfit = isNaN(initialProfit) ? 0 : initialProfit
      const safeProfit = isNaN(profit) ? 0 : profit
      const safeDeadProfit = isNaN(deadProfit) ? 0 : deadProfit

      const upfront = safeInitialProfit * 0.25
      const finalTotalTarget = safeProfit * 0.50

      const final  = isPaid ? (finalTotalTarget - upfront) : 0
      const future = !isPaid ? (finalTotalTarget - upfront) : 0
      const total  = upfront + final

      const invoiceNumber = items.invoiceNumber || items.invoice_number || null
      const paymentDate = items.paymentDate || null

      const daysOld = inv.issueDate ? (Date.now() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24) : 0
      const isAtRisk = !isPaid && daysOld >= 120
      const atRiskAmount = isAtRisk ? (upfront + future) : 0

      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoiceNumber,
        name: invoiceNumber ? `${inv.account?.name || 'Unknown'} | INV-${invoiceNumber}` : (inv.account?.name || 'Unknown'),
        amount: parseFloat(items.sub_total) || inv.amount || 0,
        profit: safeProfit,
        deadProfit: safeDeadProfit,
        deadCost,
        vigRate,
        status: inv.status,
        isPaid,
        daysOld,
        isAtRisk,
        issueDate: inv.issueDate,
        paymentDate,
        repId: matchedRepId || salespersonName?.toLowerCase().trim() || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: inv.account?.name || "Unknown",
        accountZohoId: inv.account?.zohoId || null,
        commission: { total, upfront, final, future, atRiskAmount },
        type: "invoice" as const
      }
    })

    // Statuses Zoho sets on a SO once it has been converted to an Invoice.
    // These SOs must be excluded — the Invoice is the source of truth.
    const INVOICED_SO_STATUSES = new Set(['Invoiced','invoiced','Converted','converted','Closed','closed'])

    const salesOrderRecords = rawSalesOrders.map(so => {
      const items = (so.items as any) || {}
      const cfs = items.custom_fields || []
      const salespersonName = items.salesperson as string | null
      const subTotal = parseFloat(items.sub_total || items.subTotal) || so.amount || 0
      const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

      let deadCost = parseFloat(
        items.deadCostTotal || items.dead_cost_total || items.deadCost ||
        items.cf_dead_cost_total || items.cf_dead_cost_total_unformatted ||
        items.total_dead_cost || 0
      )
      if ((isNaN(deadCost) || deadCost === 0) && lineItems.length > 0) {
        deadCost = lineItems.reduce((sum: number, li: any) => {
          const qty = parseFloat(li.quantity) || 1
          const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
          return sum + (qty * cost)
        }, 0)
      }
      if ((isNaN(deadCost) || deadCost === 0) && subTotal > 0) {
        deadCost = subTotal * 0.50
      }
      if (isNaN(deadCost)) deadCost = 0

      const docDate = so.orderDate ? new Date(so.orderDate) : new Date()
      const isMontgomery = salespersonName?.toLowerCase().includes("montgomery") || salespersonName?.toLowerCase().includes("morgan")

      const matchedRep = salespersonName ? userByName.get(salespersonName.toLowerCase().trim()) : null
      const matchedRepId = matchedRep?.id || (salespersonName ? nameToUserId.get(salespersonName.toLowerCase().trim()) : null) || null

      const vigRate = resolveVigRate(
        salespersonName,
        matchedRepId,
        docDate,
        items.cf_salesperson_vig ?? items.cf_salesperson_vig_unformatted,
        !!isMontgomery
      )
      const deadCostPlusVig = deadCost * vigRate

      const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find((c: any) => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0) || 0
      const giftsCost = parseFloat(items.gifts || items.gifts_cost || items.giftCost || cfs.find((c: any) => (c.label || '').toUpperCase().includes('GIFT'))?.value || 0) || 0
      const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find((c: any) => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0) || 0

      const initialProfit = subTotal - deadCostPlusVig - additionalCosts - giftsCost
      const profit = subTotal - deadCostPlusVig - additionalCosts - giftsCost - ccFees
      const deadProfit = subTotal - deadCost - additionalCosts - giftsCost - ccFees

      const isPaid = FINAL_PAID_STATUSES.has((so.status || '').toLowerCase())

      const safeInitialProfit = isNaN(initialProfit) ? 0 : initialProfit
      const safeProfit = isNaN(profit) ? 0 : profit
      const safeDeadProfit = isNaN(deadProfit) ? 0 : deadProfit

      const upfront = safeInitialProfit * 0.25
      const finalTotalTarget = safeProfit * 0.50

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
        profit: safeProfit,
        deadProfit: safeDeadProfit,
        deadCost,
        vigRate,
        status: so.status || 'Pending',
        isPaid,
        daysOld: so.orderDate ? (Date.now() - new Date(so.orderDate).getTime()) / (1000 * 60 * 60 * 24) : 0,
        isAtRisk: false,
        issueDate: so.orderDate,
        paymentDate: null,
        repId: matchedRepId || salespersonName?.toLowerCase().trim() || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: so.account?.name || "Unknown",
        accountZohoId: so.account?.zohoId || null,
        commission: { total, upfront, final, future, atRiskAmount: 0 },
        type: "invoice" as const
      }
    }).filter(so => !INVOICED_SO_STATUSES.has(so.status || ''))

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
          totalDeadProfit: 0,
          totalSales: 0,
          totalFutures: 0,
          totalAtRisk: 0,
          balance: 0,
        }
      }
      byRep[key].invoices.push(inv)
      byRep[key].totalEarned     += inv.commission.total         // upfront + final (if paid)
      byRep[key].totalProfit     += inv.profit                   // after-VIG profit (commission basis)
      byRep[key].totalDeadProfit += (inv as any).deadProfit || 0 // raw markup for sales goals
      byRep[key].totalSales      += inv.amount
      byRep[key].totalFutures    += inv.commission.future
      byRep[key].totalAtRisk     += inv.commission.atRiskAmount
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
    let years: number[] = []
    try {
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
      years = yearRows.map(r => r.y)
    } catch (yearErr: any) {
      console.warn("Years query failed, using fallback:", yearErr.message)
      // Fallback: derive years from invoice data in memory
      const yearSet = new Set<number>()
      for (const inv of rawInvoices) {
        if (inv.issueDate) yearSet.add(new Date(inv.issueDate).getFullYear())
      }
      years = Array.from(yearSet).sort((a, b) => b - a)
      if (years.length === 0) years = [new Date().getFullYear()]
    }

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
