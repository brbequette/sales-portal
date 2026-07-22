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

import { PrismaClient } from "@prisma/client"
import { getSystemSettings, AppSettings } from "./settings"

const prisma = new PrismaClient()

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
  return (item.name?.toLowerCase().includes("gift") || false)
}

export function isNoVigItem(item: any, noVigOverrides?: Record<string, boolean>): boolean {
  if (isGiftItem(item)) return true
  const itemID = item.item_id
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

  // 3. Check for explicit custom field VIG RATE on document
  const existingVig = doc.custom_fields?.find((f: any) =>
    f.label?.toUpperCase().includes("VIG")
  )
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

    const gift  = isGiftItem(item)
    const noVig = isNoVigItem(item, noVigOverrides)

    if (noVig) deadCostNoVig       += itemDeadCost
    else       deadCostSubjectToVig += itemDeadCost

    lineItemDetails.push({ name: item.name, sku: item.sku || null, quantity: qty, rate, cost, itemTotal, deadCost: itemDeadCost, noVig, gift })
  }

  const subTotal = parseFloat(doc.sub_total || 0)
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
