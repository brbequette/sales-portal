import { Handler } from "@netlify/functions"
import { PrismaClient, Prisma } from "@prisma/client"
import { prisma } from "./lib/prisma"
import { isNoVigItem, calculateDocumentCosts } from "./lib/cost-calculations"
import { extractDeadCostTotal, extractCcFees, extractAdditionalCosts } from "../../src/lib/custom-field-extractor"
import { getSystemSettings } from "../../src/lib/settings"


// Statuses where the FINAL half is earned (invoice has been paid)
const FINAL_PAID_STATUSES = new Set(['Paid', 'paid', 'Closed', 'closed', 'Fulfilled', 'fulfilled'])
// Statuses where at least the UPFRONT half is earned (invoice created/open)
const SKIP_STATUSES = new Set(['Void', 'void', 'Draft', 'draft'])

function getSubTotal(items: any, amount: number) {
  let sub = parseFloat(items?.sub_total ?? items?.subTotal ?? 0)
  if (isNaN(sub) || sub === 0) {
    const details = items?.lineItemDetails || items?.line_items || items?.items
    if (Array.isArray(details)) {
      sub = details.reduce((sum: number, it: any) => {
        if (it.line_item_category === "header" || it.line_item_category === "subtotal") return sum;
        const qty = parseFloat(it.quantity || 0)
        const rate = parseFloat(it.rate || it.itemTotal || it.item_total || 0)
        return sum + (qty * rate)
      }, 0)
    }
  }
  if (isNaN(sub) || sub === 0) {
    sub = amount || 0
  }
  return sub
}

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  try {
    const settings = await getSystemSettings()
    const { repId, userId, userEmail, year, includeHidden, checkOnly } = event.queryStringParameters || {}
    const showHidden = includeHidden === 'true'

    // ── checkOnly mode: fast staleness check without full commission calc ──
    if (checkOnly === 'true') {
      const targetYr = year || 'all'
      let countWhere: any = { status: { notIn: ['Void', 'void', 'Draft', 'draft'] } }
      if (targetYr !== 'all' && !isNaN(parseInt(targetYr))) {
        countWhere.issueDate = { gte: new Date(`${targetYr}-01-01`), lt: new Date(`${parseInt(targetYr)+1}-01-01`) }
      }
      const count = await prisma.invoice.count({ where: countWhere })
      return {
        statusCode: 200,
        headers: cors,
        body: JSON.stringify({ success: true, checkOnly: true, count })
      }
    }

    // Default to "all" (from beginning of time) if not specified
    const targetYear = year || "all"
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
      allVigUsers,
      vigSettingRow,
      clawbackSettingRow
    ]: [any[], any[], any[], any[], any, any, any[], any[], any[], any, any] = await Promise.all([
      // Use $queryRaw to extract the fields needed for commission calc.
      // Now includes line_items, cost breakdown fields, shipping cost, and primary contact.
      prisma.$queryRaw<any[]>(Prisma.sql`
        SELECT
          i.id::text,
          i."zohoId",
          i.amount,
          i.status,
          i."issueDate",
          i."createdAt",
          i."actualShippingCost",
          a.name    AS "accountName",
          a."zohoId" AS "accountZohoId",
          c."firstName" || ' ' || c."lastName" AS "contactName",
          COALESCE(c.phone, c."mobilePhone", i.items->>'phone', i.items->>'customer_phone', i.items->>'mobile') AS "contactPhone",
          jsonb_build_object(
            'salesperson',                COALESCE(i.items->>'salesperson_name', i.items->>'salesperson'),
            'salesperson_name',           i.items->>'salesperson_name',
            'invoiceNumber',              i.items->>'invoiceNumber',
            'invoice_number',             i.items->>'invoice_number',
            'sub_total',                  i.items->>'sub_total',
            'subTotal',                   i.items->>'subTotal',
            'total',                      i.items->>'total',
            'deadCostTotal',              i.items->>'deadCostTotal',
            'dead_cost_total',            i.items->>'dead_cost_total',
            'cf_dead_cost_total',         i.items->>'cf_dead_cost_total',
            'cf_dead_cost_total_unformatted', i.items->>'cf_dead_cost_total_unformatted',
            'deadCostSubjectToVig',       i.items->>'deadCostSubjectToVig',
            'deadCostNoVig',              i.items->>'deadCostNoVig',
            'deadCostPlusVig',            i.items->>'deadCostPlusVig',
            'cf_salesperson_vig',         i.items->>'cf_salesperson_vig',
            'cf_salesperson_vig_unformatted', i.items->>'cf_salesperson_vig_unformatted',
            'paymentDate',               COALESCE(i.items->>'last_payment_date', i.items->>'paymentDate'),
            'ccFees',                    i.items->>'ccFees',
            'cc_fees',                   i.items->>'cc_fees',
            'cf_credit_card_processing_fees', i.items->>'cf_credit_card_processing_fees',
            'cf_credit_card_processing_fees_unformatted', i.items->>'cf_credit_card_processing_fees_unformatted',
            'additionalCosts',           i.items->>'additionalCosts',
            'additional_costs',          i.items->>'additional_costs',
            'cf_additional_costs_to_order', i.items->>'cf_additional_costs_to_order',
            'cf_additional_costs_to_order_unformatted', i.items->>'cf_additional_costs_to_order_unformatted',
            'gifts',                     i.items->>'gifts',
            'gifts_cost',                i.items->>'gifts_cost',
            'giftCost',                  i.items->>'giftCost',
            'balance',                   i.items->>'balance',
            'profit',                    i.items->>'profit',
            'salesCommission',           i.items->>'salesCommission',
            'deadProfitActual',          i.items->>'deadProfitActual',
            'commissionPct',             i.items->>'commissionPct',
            'vigRate',                   i.items->>'vigRate',
            'vig',                       i.items->>'vig',
            'line_items',                i.items->'line_items',
            'items',                     i.items->'items',
            'custom_fields',             i.items->'custom_fields',
            'custom_field_hash',         i.items->'custom_field_hash'
          ) AS items
        FROM "Invoice" i
        LEFT JOIN "Account" a ON a.id = i."accountId"
        LEFT JOIN LATERAL (
          SELECT "firstName", "lastName", phone, "mobilePhone"
          FROM "Contact"
          WHERE "accountId" = a.id
          ORDER BY "isPrimary" DESC NULLS LAST, "createdAt" ASC
          LIMIT 1
        ) c ON true
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
            'salesperson',            COALESCE(s.items->>'salesperson_name', s.items->>'salesperson'),
            'salesperson_name',       s.items->>'salesperson_name',
            'salesorder_number',      s.items->>'salesorder_number',
            'salesorderNumber',       s.items->>'salesorderNumber',
            'sub_total',              s.items->>'sub_total',
            'subTotal',               s.items->>'subTotal',
            'total',                  s.items->>'total',
            'deadCostTotal',          s.items->>'deadCostTotal',
            'dead_cost_total',        s.items->>'dead_cost_total',
            'cf_dead_cost_total',     s.items->>'cf_dead_cost_total',
            'cf_dead_cost_total_unformatted', s.items->>'cf_dead_cost_total_unformatted',
            'deadCostSubjectToVig',   s.items->>'deadCostSubjectToVig',
            'deadCostNoVig',          s.items->>'deadCostNoVig',
            'deadCostPlusVig',        s.items->>'deadCostPlusVig',
            'cf_salesperson_vig',     s.items->>'cf_salesperson_vig',
            'cf_salesperson_vig_unformatted', s.items->>'cf_salesperson_vig_unformatted',
            'paymentDate',            s.items->>'paymentDate',
            'ccFees',                 s.items->>'ccFees',
            'cc_fees',                s.items->>'cc_fees',
            'cf_credit_card_processing_fees', s.items->>'cf_credit_card_processing_fees',
            'cf_credit_card_processing_fees_unformatted', s.items->>'cf_credit_card_processing_fees_unformatted',
            'additionalCosts',        s.items->>'additionalCosts',
            'additional_costs',       s.items->>'additional_costs',
            'cf_additional_costs_to_order', s.items->>'cf_additional_costs_to_order',
            'cf_additional_costs_to_order_unformatted', s.items->>'cf_additional_costs_to_order_unformatted',
            'gifts',                  s.items->>'gifts',
            'gifts_cost',             s.items->>'gifts_cost',
            'giftCost',               s.items->>'giftCost',
            'balance',                s.items->>'balance',
            'profit',                 s.items->>'profit',
            'salesCommission',        s.items->>'salesCommission',
            'deadProfitActual',       s.items->>'deadProfitActual',
            'commissionPct',          s.items->>'commissionPct',
            'vigRate',                s.items->>'vigRate',
            'vig',                    s.items->>'vig',
            'line_items',             s.items->'line_items',
            'items',                  s.items->'items',
            'custom_fields',          s.items->'custom_fields',
            'custom_field_hash',      s.items->'custom_field_hash'
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
        select: { id: true, name: true, email: true, role: true, payoutStructure: true },
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
      }).catch(() => []),
      // Fetch vig_settings JSON blob for prior-month MISSED penalty status
      prisma.systemSetting.findUnique({ where: { key: 'vig_settings' } }).catch(() => null),
      // Fetch clawback configuration
      prisma.systemSetting.findUnique({ where: { key: 'clawback_settings' } }).catch(() => null),
    ])

    // Build per-rep monthly VIG goal status map from vig_settings blob (same as get-rep-stats)
    const vigSettingsAll: Record<string, any> = vigSettingRow ? JSON.parse(vigSettingRow.value) : {}

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
      account: { name: row.accountName || null, zohoId: row.accountZohoId || null },
      contactName: row.contactName || null,
      contactPhone: row.contactPhone || null,
      actualShippingCost: row.actualShippingCost != null ? parseFloat(row.actualShippingCost) : 0,
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
    const normalizeRepName = (n: string) => {
      const val = (n || '').toLowerCase().replace(/\s+/g, ' ').trim()
      if (val === 'ben bequette') return 'benjamin bequette'
      if (val === 'monty morgan') return 'montgomery morgan'
      if (val === 'ricky griffin') return 'richard griffin'
      return val
    }

    // Build reverse lookup: salesperson name (lowercase) -> userId
    const nameToUserId = new Map<string, string>()
    for (const u of allVigUsers) {
      if (u.name) nameToUserId.set(normalizeRepName(u.name), u.id)
    }

    /**
     * Resolve the correct VIG rate for a rep on a given invoice date.
     * Priority (matches get-rep-stats.resolveVigRateSync):
     *   1. Montgomery: always 1.0; pre-2025 everyone: always 1.3
     *   2. User's constant VIG override (constantVigEnabled + constantVigValue)
     *   3. MonthlyVigGoal.manualVigRate for that rep's month
     *   4. NEW-003: Prior month MISSED → penalty 1.5
     *   5. cf_salesperson_vig field stored on the invoice
     *   6. Default 1.3 (company baseline)
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

      // NEW-004 fix: constantVig checked BEFORE cf field (matches get-rep-stats priority order)
      if (matchedRepId) {
        const userVig = vigUserMap.get(matchedRepId)

        // 2. Constant VIG override on the user record
        if (userVig?.constantVigEnabled && userVig.constantVigValue != null && !isNaN(userVig.constantVigValue)) {
          return userVig.constantVigValue
        }

        // 3. MonthlyVigGoal for the month this invoice was issued
        const monthKey = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`
        const monthlyRate = vigGoalMap.get(matchedRepId)?.get(monthKey)
        if (monthlyRate != null && !isNaN(monthlyRate) && monthlyRate >= 1.0) return monthlyRate

        // 4. NEW-003: Prior month MISSED → penalty 1.5
        const priorMonth = new Date(docDate.getFullYear(), docDate.getMonth() - 1, 1)
        const priorMonthKey = `${priorMonth.getFullYear()}-${String(priorMonth.getMonth() + 1).padStart(2, '0')}`
        // vigSettingsAll[userId].monthlyVigGoals has the status field (stored as JSON blob in SystemSetting)
        const userVigSettings = vigSettingsAll[matchedRepId]
        const priorGoal = (userVigSettings?.monthlyVigGoals || []).find((g: any) => g.monthKey === priorMonthKey)
        if (priorGoal?.status === 'MISSED') return 1.5
      }

      // 5. Try reading cf_salesperson_vig from the invoice JSON
      const fieldVal = parseFloat(rawVigField)
      if (!isNaN(fieldVal) && fieldVal >= 1.0) return fieldVal

      // 6. Default baseline
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

    const userByName = new Map()
    users.forEach(u => {
      if (u.name) userByName.set(normalizeRepName(u.name), u)
    })

    // ── Build invoice-based commission records ──────────────────────────
    // Commission is split 50/50:
    //   - Upfront (first half of commission): earned when invoice is created
    //   - Final  (second half of commission): earned when invoice is paid
    //
    // Rep attribution: items.salesperson on the document — the rep who drove the sale.
    // Account owner is a CRM assignment only and does NOT drive commissions.
    const invoiceRecords = await Promise.all(invoices.map(async (inv) => {
      const items = inv.items as any || {}
      const cfs = items.custom_fields || []
      const salespersonName = (items.salesperson_name || items.salesperson) as string | null
      const subTotal = getSubTotal(items, inv.amount)
      const invoiceNumber = items.invoiceNumber || items.invoice_number || null

      // ── Rep matching ────────────────────────────────────────
      const normSpName = salespersonName ? normalizeRepName(salespersonName) : ""
      const matchedRep = normSpName ? userByName.get(normSpName) : null
      const matchedRepId = matchedRep?.id || (normSpName ? nameToUserId.get(normSpName) : null) || null
      const isMontgomery = salespersonName?.toLowerCase().includes("montgomery") || salespersonName?.toLowerCase().includes("morgan")

      // ── VIG Rate ────────────────────────────────────────────
      const docDate = inv.issueDate ? new Date(inv.issueDate) : (inv.createdAt ? new Date(inv.createdAt) : new Date())
      const vigRate = resolveVigRate(
        salespersonName,
        matchedRepId,
        docDate,
        items.cf_salesperson_vig ?? items.cf_salesperson_vig_unformatted,
        !!isMontgomery
      )

      // ── PREFER STORED VALUES FROM calculateDocumentCosts ───
      // If the invoice has been processed (has stored profit), use stored values directly.
      // This ensures the sales sheet matches the invoice detail modal exactly.
      const hasStoredCosts = items.profit !== undefined && items.profit !== null && items.profit !== ''
      
      let deadCost: number
      let deadCostPlusVig: number
      let profit: number
      let deadProfit: number
      let salesCommission: number
      let commissionPct: number
      let usedFallbackCost = false

      if (hasStoredCosts) {
        // ── USE STORED VALUES (source of truth from cost-calculations.ts) ──
        deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || items.cf_dead_cost_total || items.cf_dead_cost_total_unformatted || 0) || 0
        deadCostPlusVig = parseFloat(items.deadCostPlusVig || 0) || (deadCost * vigRate)
        profit = parseFloat(items.profit) || 0
        deadProfit = parseFloat(items.deadProfitActual || 0) || (subTotal - deadCost)
        salesCommission = parseFloat(items.salesCommission || 0) || 0
        commissionPct = parseFloat(items.commissionPct || items.commission_pct || 50)
        usedFallbackCost = items.usedFallbackCost === true || items.usedFallbackCost === 'true'
      } else {
        // ── AUTO-PROCESS: run calculateDocumentCosts and persist results ──
        try {
          const docForCalc = {
            ...items,
            line_items: items.line_items || items.items || [],
            custom_fields: items.custom_fields || items.custom_field_hash || [],
            sub_total: subTotal,
            total: inv.amount || subTotal,
            status: inv.status,
          }
          const calc = await calculateDocumentCosts(docForCalc)
          deadCost = calc.deadCostTotal
          deadCostPlusVig = calc.deadCostPlusVig
          profit = calc.profit
          deadProfit = calc.deadProfitActual
          salesCommission = calc.salesCommission
          commissionPct = calc.commissionPct
          usedFallbackCost = calc.usedFallbackCost

          // Persist to DB so next load uses stored values
          const existingItems = items || {}
          const updatedItems = {
            ...existingItems,
            deadCostTotal: calc.deadCostTotal,
            deadCostSubjectToVig: calc.deadCostSubjectToVig,
            deadCostNoVig: calc.deadCostNoVig,
            deadCostPlusVig: calc.deadCostPlusVig,
            deadProfitActual: calc.deadProfitActual,
            profit: calc.profit,
            marginPercent: calc.marginPercent,
            subTotal: calc.subTotal,
            vigRate: calc.vigRate,
            ccFees: calc.ccFees,
            additionalCosts: calc.additionalCosts,
            insurance: calc.insurance,
            commissionPct: calc.commissionPct,
            salesCommission: calc.salesCommission,
            isPaid: calc.isPaid,
            lineItemBreakdownStrings: calc.lineItemBreakdownStrings,
            usedFallbackCost: calc.usedFallbackCost,
            costsCalculatedAt: new Date().toISOString(),
          }
          // Fire-and-forget DB update — don't block the response
          prisma.invoice.update({
            where: { id: inv.id },
            data: { items: updatedItems as any, costsCalculatedAt: new Date() },
          }).catch(e => console.error(`Auto-process invoice ${inv.id} save failed:`, e))
        } catch (calcErr) {
          console.error(`Auto-process invoice ${inv.id} failed:`, calcErr)
          // Ultimate fallback if calculateDocumentCosts errors
          deadCost = subTotal * (settings.dead_cost_fallback_pct / 100)
          deadCostPlusVig = deadCost * vigRate
          profit = subTotal - deadCostPlusVig
          deadProfit = subTotal - deadCost
          commissionPct = settings.commission_rate_pct
          salesCommission = profit > 0 ? profit * (commissionPct / 100) : 0
          usedFallbackCost = true
        }
      }

      if (isNaN(profit)) profit = 0
      if (isNaN(deadProfit)) deadProfit = 0
      if (isNaN(salesCommission)) salesCommission = 0

      const isPaid = FINAL_PAID_STATUSES.has(inv.status)

      // ── Commission payout split ─────────────────────────────
      const repPayoutStructure = matchedRep?.payoutStructure || 'two_payment'
      const isSinglePayment = repPayoutStructure === 'single_payment'

      let upfront = 0
      let final = 0
      let future = 0

      if (isSinglePayment) {
        upfront = 0
        final = isPaid ? salesCommission : 0
        future = !isPaid ? salesCommission : 0
      } else {
        // Two-stage 50/50 split of the stored salesCommission
        const halfComm = salesCommission / 2
        upfront = halfComm
        final = isPaid ? halfComm : 0
        future = !isPaid ? halfComm : 0
      }

      const total = upfront + final

      // Determine payment date
      let rawPaymentDate = items.paymentDate || items.date_paid || items.paid_date || items.last_payment_date
      if (!rawPaymentDate && isPaid) {
        rawPaymentDate = inv.updatedAt || inv.issueDate
      }

      const issueDateStr = inv.issueDate ? new Date(inv.issueDate).toISOString().split('T')[0] : null
      const paymentDateStr = rawPaymentDate ? new Date(rawPaymentDate).toISOString().split('T')[0] : null
      const isSameDayPaid = isPaid && (issueDateStr === paymentDateStr)

      const daysOld = inv.issueDate ? (Date.now() - new Date(inv.issueDate).getTime()) / (1000 * 60 * 60 * 24) : 0
      const isAtRisk = !isPaid && daysOld >= 120
      const atRiskAmount = isAtRisk ? future : 0

      const rawLineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoiceNumber,
        name: invoiceNumber ? `${inv.account?.name || 'Unknown'} | INV-${invoiceNumber}` : (inv.account?.name || 'Unknown'),
        amount: subTotal,
        profit,
        deadProfit,
        deadCost,
        deadCostPlusVig,
        vigRate,
        actualShippingCost: inv.actualShippingCost || 0,
        status: inv.status,
        isPaid,
        isSameDayPaid,
        daysOld,
        isAtRisk,
        issueDate: inv.issueDate,
        paymentDate: rawPaymentDate,
        upfrontDate: inv.issueDate,
        finalDate: rawPaymentDate,
        lineItems: rawLineItems,
        repId: matchedRepId || salespersonName?.toLowerCase().trim() || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: inv.account?.name || "Unknown",
        accountZohoId: inv.account?.zohoId || null,
        contactName: inv.contactName || null,
        contactPhone: inv.contactPhone || null,
        commission: { total, upfront, final: final, future, atRiskAmount },
        usedFallbackCost,
        type: "invoice" as const
      }
    }))

    // Statuses Zoho sets on a SO once it has been converted to an Invoice.
    // These SOs must be excluded — the Invoice is the source of truth.
    const INVOICED_SO_STATUSES = new Set(['Invoiced','invoiced','Converted','converted','Closed','closed'])

    const salesOrderRecords = (await Promise.all(rawSalesOrders.map(async (so) => {
      const items = (so.items as any) || {}
      const cfs = items.custom_fields || []
      const salespersonName = items.salesperson as string | null
      const subTotal = getSubTotal(items, so.amount)

      // ── Rep matching ────────────────────────────────────────
      const normSpName = salespersonName ? normalizeRepName(salespersonName) : ""
      const matchedRep = normSpName ? userByName.get(normSpName) : null
      const matchedRepId = matchedRep?.id || (normSpName ? nameToUserId.get(normSpName) : null) || null
      const isMontgomery = salespersonName?.toLowerCase().includes("montgomery") || salespersonName?.toLowerCase().includes("morgan")

      const docDate = so.orderDate ? new Date(so.orderDate) : new Date()
      const vigRate = resolveVigRate(
        salespersonName,
        matchedRepId,
        docDate,
        items.cf_salesperson_vig ?? items.cf_salesperson_vig_unformatted,
        !!isMontgomery
      )

      // ── PREFER STORED VALUES ────────────────────────────────
      const hasStoredCosts = items.profit !== undefined && items.profit !== null && items.profit !== ''

      let deadCost: number
      let deadCostPlusVig: number
      let profit: number
      let deadProfit: number
      let salesCommission: number
      let usedFallbackCost = false

      if (hasStoredCosts) {
        deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || items.cf_dead_cost_total || items.cf_dead_cost_total_unformatted || 0) || 0
        deadCostPlusVig = parseFloat(items.deadCostPlusVig || 0) || (deadCost * vigRate)
        profit = parseFloat(items.profit) || 0
        deadProfit = parseFloat(items.deadProfitActual || 0) || (subTotal - deadCost)
        salesCommission = parseFloat(items.salesCommission || 0) || 0
        usedFallbackCost = items.usedFallbackCost === true || items.usedFallbackCost === 'true'
      } else {
        // ── AUTO-PROCESS: run calculateDocumentCosts and persist results ──
        try {
          const docForCalc = {
            ...items,
            line_items: items.line_items || items.items || [],
            custom_fields: items.custom_fields || items.custom_field_hash || [],
            sub_total: subTotal,
            total: so.amount || subTotal,
            status: so.status,
          }
          const calc = await calculateDocumentCosts(docForCalc)
          deadCost = calc.deadCostTotal
          deadCostPlusVig = calc.deadCostPlusVig
          profit = calc.profit
          deadProfit = calc.deadProfitActual
          salesCommission = calc.salesCommission
          usedFallbackCost = calc.usedFallbackCost

          // Persist to DB
          const updatedItems = {
            ...items,
            deadCostTotal: calc.deadCostTotal,
            deadCostSubjectToVig: calc.deadCostSubjectToVig,
            deadCostNoVig: calc.deadCostNoVig,
            deadCostPlusVig: calc.deadCostPlusVig,
            deadProfitActual: calc.deadProfitActual,
            profit: calc.profit,
            marginPercent: calc.marginPercent,
            subTotal: calc.subTotal,
            vigRate: calc.vigRate,
            ccFees: calc.ccFees,
            additionalCosts: calc.additionalCosts,
            commissionPct: calc.commissionPct,
            salesCommission: calc.salesCommission,
            usedFallbackCost: calc.usedFallbackCost,
            costsCalculatedAt: new Date().toISOString(),
          }
          prisma.salesOrder.update({
            where: { id: so.id },
            data: { items: updatedItems as any, costsCalculatedAt: new Date() },
          }).catch(e => console.error(`Auto-process SO ${so.id} save failed:`, e))
        } catch (calcErr) {
          console.error(`Auto-process SO ${so.id} failed:`, calcErr)
          deadCost = subTotal * (settings.dead_cost_fallback_pct / 100)
          deadCostPlusVig = deadCost * vigRate
          profit = subTotal - deadCostPlusVig
          deadProfit = subTotal - deadCost
          salesCommission = profit > 0 ? profit * (settings.commission_rate_pct / 100) : 0
          usedFallbackCost = true
        }
      }

      if (isNaN(profit)) profit = 0
      if (isNaN(deadProfit)) deadProfit = 0
      if (isNaN(salesCommission)) salesCommission = 0

      const isPaid = FINAL_PAID_STATUSES.has((so.status || '').toLowerCase())

      const repPayoutStructure = matchedRep?.payoutStructure || 'two_payment'
      const isSinglePayment = repPayoutStructure === 'single_payment'

      let upfront = 0
      let final = 0
      let future = 0

      if (isSinglePayment) {
        upfront = 0
        final = isPaid ? salesCommission : 0
        future = !isPaid ? salesCommission : 0
      } else {
        const halfComm = salesCommission / 2
        upfront = halfComm
        final = isPaid ? halfComm : 0
        future = !isPaid ? halfComm : 0
      }

      const total = upfront + final

      const soNumber = items.salesorder_number || items.salesorderNumber || so.zohoId || null

      return {
        id: so.id,
        zohoId: so.zohoId,
        invoiceNumber: soNumber ? `SO-${soNumber}` : null,
        name: soNumber ? `${so.account?.name || 'Unknown'} | SO-${soNumber}` : (so.account?.name || 'Unknown'),
        amount: subTotal,
        profit,
        deadProfit,
        deadCost,
        vigRate,
        status: so.status || 'Pending',
        isPaid,
        daysOld: so.orderDate ? (Date.now() - new Date(so.orderDate).getTime()) / (1000 * 60 * 60 * 24) : 0,
        isAtRisk: false,
        issueDate: so.orderDate,
        paymentDate: null,
        actualShippingCost: 0,
        repId: matchedRepId || salespersonName?.toLowerCase().trim() || "unassigned",
        repName: matchedRep?.name || salespersonName || "Unassigned",
        accountName: so.account?.name || "Unknown",
        accountZohoId: so.account?.zohoId || null,
        contactName: null as string | null,
        contactPhone: null as string | null,
        commission: { total, upfront, final, future, atRiskAmount: 0 },
        usedFallbackCost,
        type: "invoice" as const
      }
    }))).filter(so => !INVOICED_SO_STATUSES.has(so.status || ''))

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
      
      // Accrue totals across all records
      byRep[key].totalEarned     += inv.commission.total
      byRep[key].totalProfit     += inv.profit
      byRep[key].totalDeadProfit += (inv as any).deadProfit || 0
      byRep[key].totalSales      += inv.amount
      byRep[key].totalFutures    += inv.commission.future
      byRep[key].totalAtRisk     += inv.commission.atRiskAmount

      // Store lightweight invoice objects for all invoices without artificial caps
      byRep[key].invoices.push({
        id: inv.id,
        zohoId: inv.zohoId || null,
        invoiceNumber: inv.invoiceNumber || null,
        name: inv.name || inv.accountName || "Invoice",
        accountName: inv.accountName || "Customer",
        amount: inv.amount || 0,
        profit: inv.profit || 0,
        deadProfit: inv.deadProfit || 0,
        deadCost: inv.deadCost || 0,
        actualShippingCost: inv.actualShippingCost || 0,
        vigRate: inv.vigRate || 1.3,
        status: inv.status || "Paid",
        isPaid: !!inv.isPaid,
        daysOld: inv.daysOld || 0,
        isAtRisk: !!inv.isAtRisk,
        issueDate: inv.issueDate || null,
        paymentDate: inv.paymentDate || null,
        contactName: inv.contactName || null,
        contactPhone: inv.contactPhone || null,
        commission: inv.commission || { total: 0, upfront: 0, final: 0, future: 0, atRiskAmount: 0 },
        usedFallbackCost: !!(inv as any).usedFallbackCost,
        repName: inv.repName || byRep[key].repName || null,
        salesperson: inv.repName || byRep[key].repName || null
      })
    }

    // Attach deal pipeline activity to reps (for display only, max 10 per rep)
    for (const deal of dealRecords) {
      const key = deal.repId
      if (!byRep[key]) {
        byRep[key] = {
          repId: deal.repId, repName: deal.repName,
          invoices: [], deals: [], payouts: [],
          totalEarned: 0, totalPaid: 0, totalProfit: 0, totalSales: 0, totalFutures: 0, totalAtRisk: 0, balance: 0
        }
      }
      if (byRep[key].deals.length < 10) {
        byRep[key].deals.push(deal)
      }
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
      // Attach payoutStructure from user record
      const user = users.find((u: any) => u.id === rep.repId)
      rep.payoutStructure = user?.payoutStructure || 'two_payment'
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

    // ── Apply repId & user role security filter ──────────────────────────────
    let finalByRep = byRep
    let finalUsers = users

    const requestingUser = users.find(u => 
      (userId && u.id === userId) || 
      (userEmail && u.email?.toLowerCase() === userEmail.toLowerCase()) ||
      (repId && u.id === repId)
    )

    const requestingRole = (requestingUser?.role || "").toLowerCase()
    const isRequestingAdmin = requestingRole.includes("admin") || requestingRole === "administrator" || requestingRole.includes("manager")

    if (repId || (requestingUser && !isRequestingAdmin)) {
      const targetRepId = repId || requestingUser?.id || requestingUser?.name?.toLowerCase().trim()
      finalByRep = {}
      if (targetRepId && byRep[targetRepId]) {
        finalByRep[targetRepId] = byRep[targetRepId]
      } else if (requestingUser) {
        // Fallback match by requestingUser name
        const matchByName = Object.values(byRep).find((r: any) => 
          r.repName?.toLowerCase().includes(requestingUser.name.toLowerCase()) ||
          requestingUser.name.toLowerCase().includes(r.repName?.toLowerCase())
        )
        if (matchByName) {
          finalByRep[(matchByName as any).repId] = matchByName
        }
      }

      if (!isRequestingAdmin && requestingUser) {
        finalUsers = [requestingUser]
      }
    }

    // Only include actual system users (skip this filter for admin/includeHidden requests)
    if (!showHidden) {
      const validUserIds = new Set(finalUsers.map((u: any) => u.id))
      for (const key in finalByRep) {
        if (!validUserIds.has(key) && !requestingUser) {
          delete finalByRep[key]
        }
      }
    }

    const allInvoices = repId
      ? allCommissionRecords.filter(i => i.repId === repId)
      : allCommissionRecords

    const stats = {
      totalInvoices: allInvoices.length,
      totalRevenue: allInvoices.reduce((s, i) => s + i.amount, 0),
      totalProfit: allInvoices.reduce((s, i) => s + i.profit, 0),
      totalCommissions: allInvoices.reduce((s, i) => s + (i.commission?.total || 0), 0),
      totalDealsInPipeline: dealRecords.length,
      totalPipelineValue: dealRecords.reduce((s, d) => s + d.amount, 0),
    }

    // Parse clawback settings
    const clawbackSettings = clawbackSettingRow
      ? JSON.parse(clawbackSettingRow.value)
      : {
          clawback_threshold_days: 365,
          warning_window_days: 90,
          rep_cost_split_pct: 0.50,
          auto_cascade: false,
          auto_bonus_reversal: false,
          cascade_depth: 'one_month',
        }

    const responseBody = JSON.stringify({
      success: true,
      year: targetYear,
      byRep: finalByRep,
      users,
      years,
      stats,
      clawbackSettings,
    })

    return { statusCode: 200, headers: cors, body: responseBody }
  } catch (err: any) {
    console.error("get-commissions error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
