export function hasStoredFinancialValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

export function hasStoredCommissionSnapshot(items: Record<string, unknown>): boolean {
  return [items.salesCommission, items.commission, items.cf_commission_amount, items.cf_commision_amount, items.cf_commission_amount_unformatted]
    .some(hasStoredFinancialValue)
}

export const COMMISSION_COST_QUALITY = {
  AUTHORITATIVE: 'AUTHORITATIVE_STORED',
  BLOCKED: 'BLOCKED_MISSING_COST',
} as const

export type CommissionCostQuality = typeof COMMISSION_COST_QUALITY[keyof typeof COMMISSION_COST_QUALITY]

export function hasAuthoritativeLegacyFinancials(items: Record<string, unknown>): boolean {
  const cost = items.deadCostTotal ?? items.dead_cost_total ?? items.deadCost ?? items.cf_dead_cost_total ?? items.cf_dead_cost_total_unformatted
  return hasStoredFinancialValue(cost)
    && hasStoredFinancialValue(items.profit)
    && hasStoredFinancialValue(items.deadProfitActual)
    && hasStoredCommissionSnapshot(items)
}

export function hasAuthoritativeInvoiceColumns(invoice: Record<string, unknown>, items: Record<string, unknown>): boolean {
  return hasStoredFinancialValue(invoice.computedDeadCost)
    && hasStoredFinancialValue(invoice.computedProfit)
    && hasStoredFinancialValue(invoice.computedDeadProfit)
    && hasStoredCommissionSnapshot(items)
}

export function classifyCommissionCostQuality(invoice: Record<string, unknown>, items: Record<string, unknown>): CommissionCostQuality {
  return hasAuthoritativeInvoiceColumns(invoice, items) || hasAuthoritativeLegacyFinancials(items)
    ? COMMISSION_COST_QUALITY.AUTHORITATIVE
    : COMMISSION_COST_QUALITY.BLOCKED
}
