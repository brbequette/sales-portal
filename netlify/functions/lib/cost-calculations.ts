/**
 * cost-calculations.ts
 *
 * Shared calculation logic used by process-invoice-costs, process-quote-costs,
 * and process-salesorder-costs. Single source of truth for:
 *
 *   - Dead cost bucketing (Subject to VIG vs No VIG)
 *   - VIG rate resolution: manual -> custom field -> user settings -> fallback
 *   - Profit = Subtotal - DeadCostPlusVIG - CC Fees - Additional Costs
 *   - Insurance is company revenue -> NOT deducted from profit
 *   - Commission = Profit * commissionPct  (only when Profit > 0)
 */

import { aggregateShippingCosts } from "../../../src/lib/shipping-costs"
import { prisma } from "./prisma"
import { getSystemSettings, AppSettings } from "./settings"
import { extractCcFees, extractAdditionalCosts, extractInsurance, extractActualShippingCost, extractShippingCostBreakdown } from "../../../src/lib/custom-field-extractor"


// ─── Types ──────────────────────────────────────────────────────────────────

export interface LineItemDetail {
  name: string
  sku: string | null
  quantity: number
  rate: number
  cost: number
  itemTotal: number
  deadCost: number
  noVig: boolean
  gift: boolean
}

export interface CostCalculationResult {
  deadCostSubjectToVig: number
  deadCostNoVig: number
  deadCostTotal: number
  vigRate: number
  deadCostPlusVig: number
  ccFees: number
  additionalCosts: number
  insurance: number          // retained for logging only -> not subtracted from profit
  subTotal: number
  totalDeductions: number    // deadCostPlusVig + ccFees + additionalCosts (no insurance)
  profit: number
  marginPercent: number
  deadProfitActual: number   // subTotal - deadCostTotal (raw margin, no VIG/fees)
  commissionPct: number
  salesCommission: number
  isPaid: boolean
  usedFallbackCost: boolean  // true when dead cost was estimated (no real cost data on line items)
  actualShippingCost: number
  shippingCostBreakdown: string
  shippingRollup: Record<string, unknown>
  lineItemDetails: LineItemDetail[]
  lineItemBreakdownStrings: string[]
}

export interface CostCalculationContext {
  settings: AppSettings
  skuMap: Map<string, any>
  nameMap: Map<string, any>
  users: any[]
  vigSettings: Record<string, any>
}

export async function createCostCalculationContext(): Promise<CostCalculationContext> {
  const [settings, dbProducts, users, vigSettingRow] = await Promise.all([
    getSystemSettings(prisma),
    prisma.product.findMany().catch(() => []),
    prisma.user.findMany().catch(() => []),
    prisma.systemSetting.findUnique({ where: { key: "vig_settings" } }).catch(() => null),
  ])

  const skuMap = new Map<string, any>()
  const nameMap = new Map<string, any>()
  dbProducts.forEach(product => {
    if (product.sku) skuMap.set(product.sku.toLowerCase().trim(), product)
    if (product.name) nameMap.set(product.name.toLowerCase().trim(), product)
  })

  let vigSettings: Record<string, any> = {}
  try {
    vigSettings = vigSettingRow?.value ? JSON.parse(vigSettingRow.value) : {}
  } catch {
    vigSettings = {}
  }

  return { settings, skuMap, nameMap, users, vigSettings }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isSwagItem(nameOrSku: string): boolean {
  const normalized = (nameOrSku || "").toLowerCase()
  return (
    normalized.includes("hat") ||
    normalized.includes("knife") ||
    normalized.includes("shirt") ||
    normalized.includes("hoodie") ||
    normalized.includes("cap") ||
    normalized.includes("swag") ||
    normalized.includes("apparel") ||
    normalized.includes("merchandise") ||
    normalized.includes("mug") ||
    normalized.includes("pen") ||
    normalized.includes("bag") ||
    normalized.includes("jacket")
  )
}

// Keywords that indicate a gift/promo/swag item — used as fallback when no Zoho field is set
const GIFT_KEYWORDS = [
  "gift", "hat", "trucker", "shirt", "t-shirt", "tee", "hoodie", "jacket",
  "apparel", "swag", "promo", "cup", "mug", "beaver", "sample",
  "card", "giftcard", "merch", "pant", "beanie", "glove", "pen",
  "banner", "flyer", "sticker", "decal", "display", "polo", "vest",
  "sweatshirt", "cap", "bag", "blade bag", "coat", "umbrella", "tumbler",
  "bottle", "keychain"
]

export function isGiftItem(item: any): boolean {
  const rate = parseFloat(item.rate || item.price || item.unit_price || 0)
  if (rate === 0) return true

  // 1. Zoho custom field check (primary / explicit)
  const cfs = item.item_custom_fields || item.custom_fields || []
  if (Array.isArray(cfs)) {
    const giftField = cfs.find((c: any) => {
      const lbl = (c.label || c.api_name || c.placeholder || "").toUpperCase()
      return lbl.includes("GIFT")
    })
    if (giftField) {
      return giftField.value === true || giftField.value === "true" || giftField.value === "Yes" || giftField.value === 1
    }
  }

  // 2. Keyword heuristic fallback — catches items like "Gift Card", "Promo Hat" etc.
  //    that lack a Zoho checkbox but are obviously non-product items.
  const name = (item.name || "").toLowerCase()
  const sku  = (item.sku  || item.code || "").toLowerCase()
  const desc = (item.description || "").toLowerCase()
  if (GIFT_KEYWORDS.some(k => name.includes(k) || sku.includes(k) || desc.includes(k))) {
    return true
  }

  return false
}

export function isNoVigItem(item: any, noVigOverrides?: Record<string, boolean>): boolean {
  const rate = parseFloat(item.rate || item.price || item.unit_price || 0)
  const itemName = item.name || ""
  const itemSku = item.sku || item.code || ""
  
  if (rate === 0) {
    if (isSwagItem(itemName) || isSwagItem(itemSku)) {
      return true
    }
    return false // Free blades still subject to VIG
  }

  if (isGiftItem(item)) {
    // If it's explicitly marked gift (and has price > 0, or is swag):
    if (isSwagItem(itemName) || isSwagItem(itemSku)) {
      return true
    }
    return false
  }
  if (item.no_vig === true || item.noVig === true || item.is_no_vig === true || item.isNoVig === true) return true
  if (item.no_vig === 'true' || item.noVig === 'true' || item.is_no_vig === 'true') return true
  if (item.subjectToVig === false || item.subject_to_vig === false || item.subjectToSalesMarkup === false) return true

  // Direct inspect cf_subject_to_sales_markup and variants
  const markupKeys = [
    'cf_subject_to_sales_markup',
    'cf_subject_to_sales_markup_unformatted',
    'subject_to_sales_markup',
    'subjectToSalesMarkup',
    'subject_to_vig',
    'subjectToVig',
    'cf_subject_to_vig',
    'cf_subject_to_vig_unformatted'
  ]

  for (const k of markupKeys) {
    if (item[k] !== undefined && item[k] !== null) {
      const val = String(item[k]).toLowerCase().trim()
      if (val === 'false' || val === 'no' || val === '0' || val === 'exempt') return true
      if (val === 'true' || val === 'yes' || val === '1') return false
    }
  }

  // Custom fields inspection on line item
  const cfs = item.item_custom_fields || item.custom_fields || []
  if (Array.isArray(cfs)) {
    const markupField = cfs.find((c: any) => {
      const lbl = (c.label || c.api_name || c.placeholder || "").toUpperCase()
      return lbl.includes("SALES MARKUP") || lbl.includes("SUBJECT TO VIG") || lbl.includes("VIG EXEMPT") || lbl.includes("CF_SUBJECT_TO_SALES_MARKUP")
    })
    if (markupField) {
      const val = String(markupField.value || "").toLowerCase().trim()
      if (val === "false" || val === "no" || val === "0" || val === "exempt") return true
      if (val === "true" || val === "yes" || val === "1") return false
    }
  }

  const itemID = item.item_id || item.id
  if (itemID && noVigOverrides && noVigOverrides[itemID]) {
    return true
  }

  // Keyword heuristic fallback — if no explicit Zoho field was found, check item
  // name / description for known gift/promo keywords (e.g. "Gift", "Hat", "Swag").
  // This mirrors the pre-d3b1f23 behaviour and catches older line items that
  // predate the Zoho custom field rollout.
  const nameLower = (item.name || "").toLowerCase()
  const skuLower  = (item.sku  || item.code || "").toLowerCase()
  const descLower = (item.description || "").toLowerCase()
  if (GIFT_KEYWORDS.some(k => nameLower.includes(k) || skuLower.includes(k) || descLower.includes(k))) {
    return true
  }

  return false
}

// ─── VIG Rate Resolution ────────────────────────────────────────────────────

export async function resolveVigRate(
  doc: any,
  settings: AppSettings,
  manualVig?: number | null,
  context?: CostCalculationContext,
): Promise<number> {
  if (manualVig !== undefined && manualVig !== null && manualVig > 0) return manualVig

  const salespersonName: string = (doc.salesperson_name || doc.salesperson || "").trim()
  const isMontgomery = salespersonName.toLowerCase().includes("montgomery") || salespersonName.toLowerCase().includes("morgan")

  // 1. Montgomery Morgan is always 1.0 VIG
  if (isMontgomery) return 1.0

  // Parse document date
  const docDateRaw = doc.date || doc.issueDate || doc.created_time
  const docDate = docDateRaw ? new Date(docDateRaw) : new Date()
  const year = docDate.getFullYear()

  // 2. Pre-2025: every invoice prior to 2025 is fixed at 1.3 (Montgomery handled above as 1.0)
  if (year <= 2024) {
    return 1.3
  }

  // 3. Check for an explicit SALESPERSON VIG RATE override on the document
  //    NOTE: Be specific — do NOT match "SALESPERSON VIG" (which is the output field we write)
  //    or "DEAD COST SUBJECT TO VIG". Only match the rate-input field.
  const existingVig = doc.custom_fields?.find((f: any) => {
    const label = (f.label || '').toUpperCase().trim()
    const apiName = (f.api_name || '').toLowerCase()
    return label === 'SALESPERSON VIG RATE' || apiName === 'cf_salesperson_vig_rate'
  })
  if (existingVig?.value && parseFloat(existingVig.value) > 0) {
    return parseFloat(existingVig.value)
  }

  // 4. Starting Jan 1, 2025:
  //    Base VIG is 1.3. If rep missed goal in prior month, VIG is 1.5.
  //    Goal before 03/2026 evaluated by Subtotal Goal. Goal 03/2026+ evaluated by Dead Profit Goal.
  if (salespersonName) {
    const users = context?.users ?? await prisma.user.findMany()
    const user = users.find(u =>
      u.name &&
      (salespersonName.toLowerCase().includes(u.name.toLowerCase()) ||
        u.name.toLowerCase().includes(salespersonName.toLowerCase()))
    )

    if (user) {
      if (user.constantVigEnabled && user.constantVigValue !== null) {
        return user.constantVigValue
      }

      // Check monthly VIG goal override in SystemSettings
      const vigSettings = context
        ? context.vigSettings
        : await prisma.systemSetting.findUnique({ where: { key: "vig_settings" } })
          .then(row => row ? JSON.parse(row.value) : {})
          .catch(() => ({}))
      const allVig = vigSettings
      const userVig = allVig[user.id]

      const monthKey = docDate.toISOString().substring(0, 7)
      const monthlyGoal = (userVig?.monthlyVigGoals || []).find((g: any) => g.monthKey === monthKey)
      if (monthlyGoal?.manualVigRate !== null && monthlyGoal?.manualVigRate !== undefined) {
        return monthlyGoal.manualVigRate
      }

      // Dynamic prior month goal hit/miss check
      const priorMonth = new Date(docDate.getFullYear(), docDate.getMonth() - 1, 1)
      const priorMonthKey = priorMonth.toISOString().substring(0, 7)
      const priorGoal = (userVig?.monthlyVigGoals || []).find((g: any) => g.monthKey === priorMonthKey)

      if (priorGoal && priorGoal.status === "MISSED") {
        return 1.5
      }
    }
  }

  return settings.default_vig_rate || 1.3
}

// ─── Commission % Resolution ────────────────────────────────────────────────

export function resolveCommissionPct(
  doc: any,
  settings: AppSettings,
  manualCommPct?: number | null
): number {
  if (manualCommPct && manualCommPct > 0) return manualCommPct

  const existingField = doc.custom_fields?.find((f: any) =>
    f.label?.toUpperCase().includes("COMMISSION FROM PROFIT")
  )
  if (existingField?.value && parseFloat(existingField.value) > 0) {
    return parseFloat(existingField.value)
  }

  return settings.commission_rate_pct
}

// ─── Main Entry Point ───────────────────────────────────────────────────────

/**
 * Calculates all cost/profit/commission fields for any Zoho Books document
 * (invoice, sales order, or estimate).
 */
export async function calculateDocumentCosts(
  doc: any,
  options: {
    manualVigRate?: number | null
    manualCommPct?: number | null
    noVigOverrides?: Record<string, boolean>
    context?: CostCalculationContext
  } = {}
): Promise<CostCalculationResult> {
  const { manualVigRate, manualCommPct, noVigOverrides } = options
  const context = options.context ?? await createCostCalculationContext()
  const { settings, skuMap, nameMap } = context

  // ─── 1. Dead cost bucketing ─────────────────────────────────────────────────
  let deadCostSubjectToVig = 0
  let deadCostNoVig = 0
  const lineItemDetails: LineItemDetail[] = []

  for (const item of (doc.line_items || [])) {
    // Zoho Books API now supports "header" and "subtotal" rows. Skip them in cost calculations.
    if (item.line_item_category === "header" || item.line_item_category === "subtotal") continue;

    const qty          = parseFloat(item.quantity || 1)
    const rate         = parseFloat(item.rate || 0)
    const cost         = parseFloat(item.purchase_rate || item.pricebook_rate || 0)
    const discountAmount = parseFloat(item.discount_amount || 0)
    const itemTotal    = item.item_total !== undefined ? parseFloat(item.item_total) : ((qty * rate) - discountAmount)
    const itemDeadCost = qty * cost

    const itemSku = (item.sku || item.code || "").toLowerCase().trim()
    const itemName = (item.name || "").toLowerCase().trim()

    const catalogProd = skuMap.get(itemSku) || nameMap.get(itemName)

    let gift = isGiftItem(item)
    let noVig = isNoVigItem(item, noVigOverrides)

    if (catalogProd) {
      if (catalogProd.giftItem) gift = true
      if (catalogProd.subjectToVig === false || catalogProd.giftItem === true) noVig = true
    }

    if (noVig) deadCostNoVig       += itemDeadCost
    else       deadCostSubjectToVig += itemDeadCost

    lineItemDetails.push({ name: item.name, sku: item.sku || null, quantity: qty, rate, cost, itemTotal, deadCost: itemDeadCost, noVig, gift })
  }

  let subTotal = parseFloat(doc.sub_total || 0)
  if ((isNaN(subTotal) || subTotal === 0) && doc.line_items && Array.isArray(doc.line_items)) {
    subTotal = doc.line_items.reduce((sum: number, item: any) => {
      if (item.line_item_category === "header" || item.line_item_category === "subtotal") return sum;
      const qty = parseFloat(item.quantity || 0)
      const rate = parseFloat(item.rate || 0)
      const discountAmount = parseFloat(item.discount_amount || 0)
      return sum + ((qty * rate) - discountAmount)
    }, 0)
  }

  let ccFees          = extractCcFees(doc)
  const additionalCosts = extractAdditionalCosts(doc)
  const insurance       = extractInsurance(doc) // not subtracted

  // Dynamic CC Processing Fees Calculation for Paid Invoices
  const invoiceId = doc.invoice_id || doc.id
  const isInvoice = doc.invoice_id !== undefined || doc.invoice_number !== undefined
  if (isInvoice && invoiceId) {
    try {
      const dbPayments = await prisma.payment.findMany({
        where: {
          OR: [
            { invoiceId: String(invoiceId) },
            { invoiceNumber: String(doc.invoice_number || '') }
          ]
        }
      })
      const hasCardPayment = dbPayments.some(p => {
        const mode = (p.mode || '').toLowerCase()
        return mode.includes('authorize') ||
               mode.includes('stripe') ||
               mode.includes('zelle') ||
               mode.includes('card') ||
               mode.includes('square') ||
               mode.includes('forte') ||
               mode.includes('leap payment') ||
               mode.includes('paypal')
      })
      if (hasCardPayment) {
        ccFees = subTotal * (settings.cc_fee_rate / 100)
      } else if (dbPayments.length > 0) {
        // If there are payments but none are card (e.g. check or cash), fee is 0
        ccFees = 0
      }
    } catch (e) {
      console.error("Error checking payments for cc fees calculation:", e)
    }
  }

  let deadCostTotal = deadCostSubjectToVig + deadCostNoVig + additionalCosts

  // Fallback: If document has subTotal > 0 but zero line items or missing cost data in Books,
  // estimate base product cost as 50% of subTotal so profit is not artificially inflated.
  let usedFallbackCost = false
  if ((deadCostSubjectToVig + deadCostNoVig) === 0 && subTotal > 0) {
    const fallbackPct = settings.dead_cost_fallback_pct || 60
    deadCostSubjectToVig = subTotal * (fallbackPct / 100)
    deadCostTotal = deadCostSubjectToVig + additionalCosts
    usedFallbackCost = true

    // Distribute fallback cost to line items so they render correctly in the UI
    for (const d of lineItemDetails) {
      if (d.rate > 0) {
        d.cost = d.rate * (fallbackPct / 100)
        d.deadCost = d.itemTotal * (fallbackPct / 100)
      }
    }
  }

  // ─── 2. VIG rate ────────────────────────────────────────────────────────────
  const vigRate = await resolveVigRate(doc, settings, manualVigRate, context)

  // ─── 3. Dead Cost Plus VIG ──────────────────────────────────────────────────
  const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig

  // ─── 4. Line item breakdown strings ─────────────────────────────────────────
  const lineItemBreakdownStrings = lineItemDetails.map(d => {
    const vigDC    = d.noVig ? d.deadCost : d.deadCost * vigRate
    const vigLabel = d.noVig ? "No VIG" : "Subj to VIG"
    const flags: string[] = []
    if (d.noVig && !d.gift) flags.push("No VIG")
    if (d.gift) flags.push("GIFT")
    const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : ""
    return `${d.quantity}x ${d.sku || d.name} | Cost: $${d.cost.toFixed(2)} | DC: $${d.deadCost.toFixed(2)} | VIG-DC: $${vigDC.toFixed(2)} | ${vigLabel}${flagStr}`
  })

  // ─── 4b. Shipping Cost & Breakdown Resolution ──────────────────────────────
  const legacyShippingCost = extractActualShippingCost(doc)
  const legacyShippingBreakdown = extractShippingCostBreakdown(doc) || ""
  const docSoNum = doc.salesorder_number || doc.items?.salesOrderNumber || doc.items?.salesorderNumber
  const docSoId = doc.salesorder_id || doc.items?.salesOrderZohoId || doc.items?.salesorder_id
  let dbPackages: any[] = []

  if (docSoNum || docSoId) {
    try {
      const packageLinks = [
        docSoNum ? { salesOrderNumber: String(docSoNum) } : null,
        docSoId ? { salesOrderId: String(docSoId) } : null,
      ].filter(Boolean) as any[]
      dbPackages = await prisma.package.findMany({ where: { OR: packageLinks } })
    } catch (e) {
      console.error("Error checking packages for shipping breakdown:", e)
    }
  }

  const shipping = aggregateShippingCosts({
    legacyCost: legacyShippingCost,
    legacyBreakdown: legacyShippingBreakdown,
    allocations: doc.items?.shippingAllocations || doc.shippingAllocations || [],
    packages: dbPackages,
    priorRollup: doc.items?.shippingRollup || null,
  })
  const actualShippingCost = shipping.total
  const shippingCostBreakdown = shipping.breakdown

  // ─── 5. Profit ──────────────────────────────────────────────────────────────
  // Actual freight/label cost is tracked for invoice and shipping reporting only; it does not reduce profit or commission.
  const totalDeductions  = deadCostPlusVig + ccFees + additionalCosts
  const profit           = subTotal - totalDeductions
  const marginPercent    = subTotal > 0 ? (profit / subTotal) * 100 : 0
  const deadProfitActual = subTotal - deadCostTotal - ccFees

  // ─── 6. Commission ──────────────────────────────────────────────────────────
  const commissionPct   = resolveCommissionPct(doc, settings, manualCommPct)
  // If profit is negative, the loss is split 50/50 between the company and the rep.
  // Otherwise, the rep gets their resolved commission percentage of the profit.
  const salesCommission = profit < 0 ? profit * (settings.loss_split_pct / 100) : profit * (commissionPct / 100)

  // ─── 7. Paid ────────────────────────────────────────────────────────────────
  const isPaid = doc.status === "paid" || parseFloat(doc.balance || 0) <= 0
  return {
    deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
    vigRate, deadCostPlusVig,
    ccFees, additionalCosts, insurance,
    subTotal, totalDeductions,
    profit, marginPercent, deadProfitActual,
    commissionPct, salesCommission,
    isPaid, usedFallbackCost, actualShippingCost, shippingCostBreakdown, shippingRollup: shipping.rollup,
    lineItemDetails, lineItemBreakdownStrings,
  }
}

// ─── Field Diff Builder ──────────────────────────────────────────────────────
/**
 * Compares calculated values against the existing Zoho custom fields and returns
 * only the fields that have actually changed. Exported so both bulk-calculate-costs
 * and bulk-process-costs use the identical diff logic.
 *
 * docTypeHint: "invoices" | "quotes" | "salesorders" — controls PAID IN FULL DATE logic
 */
export function buildFieldsToUpdate(
  calc: CostCalculationResult,
  zohoDoc: any,
  docTypeHint: string = "invoices",
  configuredFieldDefinitions: any[] = []
): any[] {
  const {
    deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
    vigRate, deadCostPlusVig, profit, deadProfitActual,
    commissionPct, salesCommission, isPaid, lineItemBreakdownStrings,
    ccFees, actualShippingCost, shippingCostBreakdown,
  } = calc

  const existingFields: any[] = [...(zohoDoc.custom_fields || [])]
  for (const definition of configuredFieldDefinitions) {
    const customfieldId = definition.customfield_id || definition.field_id
    if (!customfieldId) continue
    if (existingFields.some((field: any) =>
      field.customfield_id === customfieldId ||
      (field.api_name && field.api_name === definition.api_name)
    )) continue
    existingFields.push({
      ...definition,
      customfield_id: customfieldId,
      value: definition.value ?? "",
    })
  }
  const existingPaidDate = existingFields.find((f: any) =>
    f.label?.toUpperCase().includes("PAID IN FULL DATE") || f.api_name === "cf_paid_in_full_date"
  )

  const fieldMap: Record<string, any> = {
    "DEAD COST TOTAL":          deadCostTotal.toFixed(2),
    "DEAD COST SUBJECT TO VIG": deadCostSubjectToVig.toFixed(2),
    "DEAD COST NO VIG":         deadCostNoVig.toFixed(2),
    "SALESPERSON VIG":          vigRate,
    "DEAD COST PLUS VIG":       deadCostPlusVig.toFixed(2),
    "PROFIT":                   profit.toFixed(2),
    "COMMISSION FROM PROFIT %": commissionPct,
    "SALES COMMISSION":         salesCommission.toFixed(2),
    "ITEMS DC BREAKDOWN":       lineItemBreakdownStrings.join("\n"),
    "CREDIT CARD PROCESSING FEES": ccFees.toFixed(2),
    "ACTUAL SHIPPING COST":     actualShippingCost.toFixed(2),
    "SHIPPING COST BREAKDOWN":  shippingCostBreakdown,
  }

  if (docTypeHint === "invoices" && isPaid && existingPaidDate && !existingPaidDate.value) {
    fieldMap["PAID IN FULL DATE"] = new Date().toISOString().split("T")[0]
  }

  const apiNameMap: Record<string, any> = {
    cf_dead_cost_total:             deadCostTotal.toFixed(2),
    cf_dead_cost_subject_to_vig:    deadCostSubjectToVig.toFixed(2),
    cf_dead_cost_no_vig:            deadCostNoVig.toFixed(2),
    cf_salesperson_vig:             vigRate,
    cf_dead_cost_with_vig:          deadCostPlusVig.toFixed(2),
    cf_profit:                      profit.toFixed(2),
    cf_commision_from_profit:       commissionPct,
    cf_commision_amount:            salesCommission.toFixed(2),
    cf_dc_breakdown:                lineItemBreakdownStrings.join("\n"),
    cf_credit_card_processing_fees: ccFees.toFixed(2),
    cf_actual_shipping_cost:        actualShippingCost.toFixed(2),
    cf_shipping_cost_breakdown:     shippingCostBreakdown,
    cf_dead_profit_actual:          deadProfitActual.toFixed(2),
  }

  if (docTypeHint === "invoices" && isPaid && existingPaidDate && !existingPaidDate.value) {
    apiNameMap.cf_paid_in_full_date = new Date().toISOString().split("T")[0]
  }

  const fieldsToUpdate: any[] = []

  for (const [label, value] of Object.entries(fieldMap)) {
    const field = existingFields.find((f: any) => f.label?.toUpperCase().trim() === label)
    if (field) {
      // Field exists on the doc — only push if value changed or currently blank
      const currentVal = String(field.value ?? "").trim()
      const newVal = String(value).trim()
      if (currentVal !== newVal || currentVal === "" || currentVal === "0") {
        fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
      }
    }
  }

  for (const [apiName, value] of Object.entries(apiNameMap)) {
    const field = existingFields.find((f: any) => f.api_name === apiName)
    if (field) {
      const currentVal = String(field.value ?? "").trim()
      const newVal = String(value).trim()
      if (currentVal !== newVal || currentVal === "" || currentVal === "0") {
        if (!fieldsToUpdate.some((f: any) => f.customfield_id === field.customfield_id)) {
          fieldsToUpdate.push({ customfield_id: field.customfield_id, value })
        }
      }
    }
  }

  return fieldsToUpdate
}
