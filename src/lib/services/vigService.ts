/**
 * vigService.ts
 * Authoritative service module for calculating Dead Cost, Vig Rates, Estimated Profit, and Commission.
 */

export interface LineItem {
  id?: string
  name?: string
  quantity?: number
  rate?: number
  pricebook_rate?: number
  purchase_rate?: number
  cost?: number
  amount?: number
}

export interface DocumentCostSummary {
  subtotal: number
  deadCostTotal: number
  vigRate: number
  deadCostPlusVig: number
  profit: number
  salesCommission: number
}

/**
 * Computes standard VIG multiplier for a salesperson.
 * Default VIG is 1.3 (30% markup on dead cost).
 * Special exception: Montgomery/Morgan reps have 1.0 VIG (0% markup).
 */
export function getVigRateForSalesperson(salespersonName?: string | null): number {
  if (!salespersonName) return 1.3
  const lower = salespersonName.toLowerCase()
  if (lower.includes("montgomery") || lower.includes("morgan")) {
    return 1.0
  }
  return 1.3
}

/**
 * Calculates complete cost summary for a document or set of line items.
 */
export function calculateDocumentCosts(
  subtotal: number,
  lineItems: LineItem[] = [],
  salespersonName?: string | null,
  customVigRate?: number
): DocumentCostSummary {
  let deadCostTotal = 0

  if (Array.isArray(lineItems) && lineItems.length > 0) {
    lineItems.forEach(item => {
      const qty = item.quantity || 1
      const unitCost = item.purchase_rate ?? item.cost ?? item.pricebook_rate ?? 0
      deadCostTotal += qty * unitCost
    })
  }

  // Fallback: If line items have 0 unit cost specified, default to 50% of subtotal as estimated dead cost
  if (deadCostTotal === 0 && subtotal > 0) {
    deadCostTotal = subtotal * 0.60
  }

  const vigRate = customVigRate ?? getVigRateForSalesperson(salespersonName)
  const deadCostPlusVig = deadCostTotal * vigRate
  const profit = subtotal - deadCostPlusVig
  const salesCommission = profit * 0.50 // 50% commission on net profit after VIG (loss split supported)

  return {
    subtotal,
    deadCostTotal,
    vigRate,
    deadCostPlusVig,
    profit,
    salesCommission
  }
}
