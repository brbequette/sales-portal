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

import { prisma } from "./prisma"
import { getSystemSettings, AppSettings } from "./settings"
import { extractCcFees, extractAdditionalCosts, extractInsurance } from "../../../src/lib/custom-field-extractor"


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
  lineItemDetails: LineItemDetail[]
  lineItemBreakdownStrings: string[]
}

// ─── Helpers ────────────────────────────────────────────────────────────────

export function isGiftItem(item: any): boolean {
  const name = (item.name || "").toLowerCase()
  const sku = (item.sku || item.code || "").toLowerCase()
  const description = (item.description || "").toLowerCase()

  const giftKeywords = [
    "gift", "hat", "trucker", "shirt", "t-shirt", "tee", "hoodie", "jacket",
    "apparel", "swag", "promo", "cup", "mug", "beaver", "sample",
    "card", "giftcard", "merch", "pant", "beanie", "glove", "pen",
    "banner", "flyer", "sticker", "decal", "display", "polo", "vest",
    "sweatshirt", "cap", "bag", "blade bag", "coat", "umbrella", "tumbler",
    "bottle", "keychain"
  ]

  const matchesKeyword = giftKeywords.some(k => name.includes(k) || sku.includes(k) || description.includes(k))

  return matchesKeyword
}

import exemptCatalog from "../../../src/lib/exempt-catalog.json"

export function isNoVigItem(item: any, noVigOverrides?: Record<string, boolean>): boolean {
  if (isGiftItem(item)) return true
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

  const sku = (item.sku || item.code || "").toUpperCase().trim()
  const name = (item.name || "").toUpperCase().trim()
  if (
    exemptCatalog.exemptSkus.some((s: string) => sku === s || name === s) ||
    exemptCatalog.exemptPrefixes.some((p: string) => (sku && sku.startsWith(p)) || (name && name.startsWith(p)))
  ) {
    return true
  }

  const itemID = item.item_id || item.id
  if (itemID && noVigOverrides && noVigOverrides[itemID]) {
    return true
  }
  return false
}

// ─── VIG Rate Resolution ────────────────────────────────────────────────────

export async function resolveVigRate(
  doc: any,
  settings: AppSettings,
  manualVig?: number | null
): Promise<number> {
  if (manualVig !== undefined && manualVig !== null && manualVig > 0) return manualVig

  const salespersonName: string = (doc.salesperson_name || doc.salesperson || "").trim()
  const isMontgomery = salespersonName.toLowerCase().includes("montgomery") || salespersonName.toLowerCase().includes("morgan")

  // Parse document date
  const docDateRaw = doc.date || doc.issueDate || doc.created_time
  const docDate = docDateRaw ? new Date(docDateRaw) : new Date()
  const year = docDate.getFullYear()

  // 1. Up to end of 2024 (through Dec 31, 2024):
  //    Monty is 1.0 VIG; everyone else is 1.3 VIG.
  if (year <= 2024) {
    return isMontgomery ? 1.0 : 1.3
  }

  // 2. Montgomery is always 1.0 unless explicitly overridden
  if (isMontgomery) return 1.0

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
    const users = await prisma.user.findMany()
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
      const vigSettings = await prisma.systemSetting.findUnique({ where: { key: "vig_settings" } })
      const allVig = vigSettings ? JSON.parse(vigSettings.value) : {}
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
  } = {}
): Promise<CostCalculationResult> {
  const { manualVigRate, manualCommPct, noVigOverrides } = options
  
  const settings = await getSystemSettings(prisma)

  // Pre-fetch DB products for accurate catalog VIG lookup
  const dbProducts = await prisma.product.findMany().catch(() => [])
  const skuMap = new Map<string, any>()
  const nameMap = new Map<string, any>()
  dbProducts.forEach(p => {
    if (p.sku) skuMap.set(p.sku.toLowerCase().trim(), p)
    if (p.name) nameMap.set(p.name.toLowerCase().trim(), p)
  })

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
    const itemTotal    = qty * rate
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
      return sum + (qty * rate)
    }, 0)
  }
  let deadCostTotal = deadCostSubjectToVig + deadCostNoVig

  // Fallback: If document has subTotal > 0 but zero line items or missing cost data in Books,
  // estimate base product cost as 50% of subTotal so profit is not artificially inflated.
  if (deadCostTotal === 0 && subTotal > 0) {
    deadCostSubjectToVig = subTotal * 0.50
    deadCostTotal = deadCostSubjectToVig
  }

  // ─── 2. VIG rate ────────────────────────────────────────────────────────────
  const vigRate = await resolveVigRate(doc, settings, manualVigRate)

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

  // ─── 5. Profit ──────────────────────────────────────────────────────────────

  const ccFees          = extractCcFees(doc)
  const additionalCosts = extractAdditionalCosts(doc)
  const insurance       = extractInsurance(doc) // not subtracted


  const totalDeductions  = deadCostPlusVig + ccFees + additionalCosts
  const profit           = subTotal - totalDeductions
  const marginPercent    = subTotal > 0 ? (profit / subTotal) * 100 : 0
  const deadProfitActual = subTotal - deadCostTotal - ccFees - additionalCosts

  // ─── 6. Commission ──────────────────────────────────────────────────────────
  const commissionPct   = resolveCommissionPct(doc, settings, manualCommPct)
  // 50/50 Profit/Loss Split: Rep earns 50% of positive profit, or absorbs 50% of negative profit (loss)
  const salesCommission = profit * (commissionPct / 100)

  // ─── 7. Paid ────────────────────────────────────────────────────────────────
  const isPaid = doc.status === "paid" || parseFloat(doc.balance || 0) <= 0

  return {
    deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
    vigRate, deadCostPlusVig,
    ccFees, additionalCosts, insurance,
    subTotal, totalDeductions,
    profit, marginPercent, deadProfitActual,
    commissionPct, salesCommission,
    isPaid,
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
  docTypeHint: string = "invoices"
): any[] {
  const {
    deadCostSubjectToVig, deadCostNoVig, deadCostTotal,
    vigRate, deadCostPlusVig, profit, deadProfitActual,
    commissionPct, salesCommission, isPaid, lineItemBreakdownStrings,
  } = calc

  const existingFields: any[] = zohoDoc.custom_fields || []
  const existingPaidDate = existingFields.find((f: any) =>
    f.label?.toUpperCase().includes("PAID IN FULL DATE")
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
  }

  if (docTypeHint === "invoices" && isPaid && existingPaidDate && !existingPaidDate.value) {
    fieldMap["PAID IN FULL DATE"] = new Date().toISOString().split("T")[0]
  }

  const apiNameMap: Record<string, any> = {
    cf_dead_profit_actual: deadProfitActual.toFixed(2),
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
    } else {
      // Field not yet on this doc — write it by label so Zoho matches it
      // to the org-level custom field definition. Zoho accepts label+value on PUT.
      fieldsToUpdate.push({ label, value })
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
    } else {
      // Not on doc yet — write by api_name fallback
      if (!fieldsToUpdate.some((f: any) => f.api_name === apiName)) {
        fieldsToUpdate.push({ api_name: apiName, value })
      }
    }
  }

  return fieldsToUpdate
}
