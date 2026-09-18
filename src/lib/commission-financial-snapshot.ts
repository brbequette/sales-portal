export function hasStoredFinancialValue(value: unknown): boolean {
  return value !== undefined && value !== null && value !== ''
}

export function hasStoredCommissionSnapshot(items: Record<string, unknown>): boolean {
  return [items.salesCommission, items.commission, items.cf_commission_amount, items.cf_commision_amount, items.cf_commission_amount_unformatted]
    .some(hasStoredFinancialValue)
}

export function hasAuthoritativeInvoiceColumns(invoice: Record<string, unknown>, items: Record<string, unknown>): boolean {
  return hasStoredFinancialValue(invoice.computedDeadCost)
    && hasStoredFinancialValue(invoice.computedProfit)
    && hasStoredFinancialValue(invoice.computedDeadProfit)
    && hasStoredCommissionSnapshot(items)
}
