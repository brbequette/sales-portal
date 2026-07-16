/**
 * cost-calculations.ts
 *
 * Shared calculation logic used by process-invoice-costs, process-quote-costs,
 * and process-salesorder-costs. Single source of truth for:
 *
 *   - Dead cost bucketing (Subject to VIG vs No VIG)
 *   - VIG rate resolution: manual → custom field → user settings → 1.3 fallback
 *   - Profit = Subtotal − DeadCostPlusVIG − CC Fees − Additional Costs
 *   - Insurance is company revenue — NOT deducted from profit
 *   - Commission = Profit × commissionPct  (only when Profit > 0)
 */

import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// ─── Types ────────────────────────────────────────────────────────────────────

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
  insurance: number          // retained for logging only — not subtracted from profit
  subTotal: number
  totalDeductions: number    // deadCostPlusVig + ccFees + additionalCosts (no insurance)
  profit: number
  marginPercent: number
  deadProfitActual: number   // subTotal − deadCostTotal (raw margin, no VIG/fees)
  commissionPct: number
  salesCommission: number
  isPaid: boolean
  lineItemDetails: LineItemDetail[]
  lineItemBreakdownStrings: string[]
}

// ─── Item Helpers ─────────────────────────────────────────────────────────────

/** True if a line item should be treated as a gift/free item */
export function isGiftItem(item: any): boolean {
  if (!item) return false
  const rate = parseFloat(item.rate || 0)
  if (rate === 0) return true
  const desc = (item.description || "").toLowerCase()
  const name = (item.name || "").toLowerCase()
  return desc.includes("gift") || name.includes("gift") || desc.includes("free") || name.includes("free")
}

/** True if item belongs in the No VIG bucket */
export function isNoVigItem(item: any, noVigOverrides?: Record<string, boolean>): boolean {
  if (isGiftItem(item)) return true

  // Explicit override passed by caller
  if (noVigOverrides && item.line_item_id && noVigOverrides[item.line_item_id] !== undefined) {
    return noVigOverrides[item.line_item_id]
  }

  // Custom field on the line item
  const cfNoVig = item.custom_fields?.find((f: any) =>
    f.api_name === "cf_subject_to_vig" || f.label?.toUpperCase().includes("SUBJECT TO VIG")
  )
  if (cfNoVig) {
    const val = cfNoVig.value
    if (val === false || val === "false" || val === "0" || val === "") return true
  }

  return false
}

// ─── VIG Rate Resolution ──────────────────────────────────────────────────────

/**
 * Resolves the VIG multiplier for a document.
 * Priority:
 *   1. manualVigRate argument
 *   2. SALESPERSON VIG custom field already on the document
 *   3. User VIG settings in the DB (constant or monthly goal)
 *   4. Fallback: 1.3
 */
export async function resolveVigRate(
  doc: any,
  manualVigRate?: number | null
): Promise<number> {
  if (manualVigRate && manualVigRate > 0) return manualVigRate

  const existingVig = doc.custom_fields?.find((f: any) =>
    f.label?.toUpperCase().includes("SALESPERSON VIG") || f.api_name === "cf_salesperson_vig"
  )
  if (existingVig?.value && parseFloat(existingVig.value) > 0) {
    return parseFloat(existingVig.value)
  }

  const salespersonName: string = doc.salesperson_name || ""
  if (salespersonName) {
    const isMontgomery =
      salespersonName.toLowerCase().includes("montgomery") ||
      salespersonName.toLowerCase().includes("morgan")
    if (isMontgomery) return 1.0

    const users = await prisma.user.findMany()
    const user = users.find(u =>
      u.name &&
      (salespersonName.toLowerCase().includes(u.name.toLowerCase()) ||
        u.name.toLowerCase().includes(salespersonName.toLowerCase()))
    )

    if (user) {
      const settings = await prisma.systemSetting.findUnique({ where: { key: "vig_settings" } })
      const allVig = settings ? JSON.parse(settings.value) : {}
      const userVig = allVig[user.id]

      if (userVig) {
        if (userVig.constantVigEnabled && userVig.constantVigValue !== null) {
          return userVig.constantVigValue
        }
        const docDate = doc.date || doc.created_time
        const monthKey = docDate
          ? new Date(docDate).toISOString().substring(0, 7)
          : new Date().toISOString().substring(0, 7)
        const monthlyGoal = (userVig.monthlyVigGoals || []).find((g: any) => g.monthKey === monthKey)
        if (monthlyGoal?.manualVigRate !== null && monthlyGoal?.manualVigRate !== undefined) {
          return monthlyGoal.manualVigRate
        }
      }
    }
  }

  return 1.3 // fallback default
}

// ─── Commission % Resolution ──────────────────────────────────────────────────

export function resolveCommissionPct(doc: any, manualCommPct?: number | null): number {
  if (manualCommPct && manualCommPct > 0) return manualCommPct

  const existingField = doc.custom_fields?.find((f: any) =>
    f.label?.toUpperCase().includes("COMMISSION FROM PROFIT")
  )
  if (existingField?.value && parseFloat(existingField.value) > 0) {
    return parseFloat(existingField.value)
  }

  return 50 // default 50%
}

// ─── Main Entry Point ─────────────────────────────────────────────────────────

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

  // ── 1. Dead cost bucketing ───────────────────────────────────────────
  let deadCostSubjectToVig = 0
  let deadCostNoVig = 0
  const lineItemDetails: LineItemDetail[] = []

  for (const item of (doc.line_items || [])) {
    const qty          = parseFloat(item.quantity || 1)
    const rate         = parseFloat(item.rate || 0)
    const cost         = parseFloat(item.purchase_rate || item.pricebook_rate || 0)
    const itemTotal    = qty * rate
    const itemDeadCost = qty * cost

    const gift  = isGiftItem(item)
    const noVig = isNoVigItem(item, noVigOverrides)

    if (noVig) deadCostNoVig       += itemDeadCost
    else       deadCostSubjectToVig += itemDeadCost

    lineItemDetails.push({ name: item.name, sku: item.sku || null, quantity: qty, rate, cost, itemTotal, deadCost: itemDeadCost, noVig, gift })
  }

  const deadCostTotal = deadCostSubjectToVig + deadCostNoVig

  // ── 2. VIG rate ──────────────────────────────────────────────────────
  const vigRate = await resolveVigRate(doc, manualVigRate)

  // ── 3. Dead Cost Plus VIG ────────────────────────────────────────────
  const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig

  // ── 4. Line item breakdown strings ──────────────────────────────────
  const lineItemBreakdownStrings = lineItemDetails.map(d => {
    const vigDC    = d.noVig ? d.deadCost : d.deadCost * vigRate
    const vigLabel = d.noVig ? "No VIG" : "Subj to VIG"
    const flags: string[] = []
    if (d.noVig && !d.gift) flags.push("No VIG")
    if (d.gift) flags.push("GIFT")
    const flagStr = flags.length > 0 ? ` [${flags.join(", ")}]` : ""
    return `${d.quantity}x ${d.sku || d.name} | Cost: $${d.cost.toFixed(2)} | DC: $${d.deadCost.toFixed(2)} | VIG-DC: $${vigDC.toFixed(2)} | ${vigLabel}${flagStr}`
  })

  // ── 5. Profit ────────────────────────────────────────────────────────
  // Profit = Subtotal − DeadCostPlusVIG − CC Fees − Additional Costs
  // NOTE: Insurance is company revenue and is NOT deducted from profit.
  const subTotal = parseFloat(doc.sub_total || 0)

  const ccFeesField          = doc.custom_fields?.find((f: any) => f.label?.toUpperCase().includes("CREDIT CARD PROCESSING"))
  const additionalCostsField = doc.custom_fields?.find((f: any) => f.label?.toUpperCase().includes("ADDITIONAL COSTS SEE"))
  const insuranceField       = doc.custom_fields?.find((f: any) => f.label?.toUpperCase() === "INSURANCE")

  const ccFees          = ccFeesField          ? parseFloat(ccFeesField.value          || 0) : 0
  const additionalCosts = additionalCostsField ? parseFloat(additionalCostsField.value || 0) : 0
  const insurance       = insuranceField       ? parseFloat(insuranceField.value       || 0) : 0 // not subtracted

  const totalDeductions  = deadCostPlusVig + ccFees + additionalCosts
  const profit           = subTotal - totalDeductions
  const marginPercent    = subTotal > 0 ? (profit / subTotal) * 100 : 0
  const deadProfitActual = subTotal - deadCostTotal

  // ── 6. Commission ────────────────────────────────────────────────────
  const commissionPct   = resolveCommissionPct(doc, manualCommPct)
  const salesCommission = profit > 0 ? profit * (commissionPct / 100) : 0

  // ── 7. Paid ──────────────────────────────────────────────────────────
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
