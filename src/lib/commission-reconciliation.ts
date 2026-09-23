export const money = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100

const number = (value: unknown): number | null => {
  if (value === null || value === undefined || value === "") return null
  const parsed = Number(String(value).replace(/[$,%]/g, ""))
  return Number.isFinite(parsed) ? parsed : null
}

export type CommissionReconciliation = {
  subtotal: number
  deadCostSubjectToVig: number
  deadCostNoVig: number
  additionalCosts: number
  ccFees: number
  deadCostTotal: number
  deadCostPlusVig: number
  profit: number
  deadProfitActual: number
  commissionPercent: number
  commission: number
  vigRate: number
}

export function reconcileStoredInvoiceFinancials(items: Record<string, unknown>, amount: number, vigRate: number): CommissionReconciliation | null {
  const subtotal = number(items.sub_total ?? items.subTotal) ?? amount
  const subject = number(items.deadCostSubjectToVig)
  const noVig = number(items.deadCostNoVig)
  if (subject == null || noVig == null || !Number.isFinite(subtotal) || !Number.isFinite(vigRate)) return null
  const additional = number(items.additionalCosts) ?? 0
  const ccFees = number(items.ccFees) ?? 0
  const deadCostTotal = money(subject + noVig + additional)
  const deadCostPlusVig = money(subject * vigRate + noVig)
  const profit = money(subtotal - deadCostPlusVig - ccFees - additional)
  const deadProfitActual = money(subtotal - deadCostTotal - ccFees)
  return {
    subtotal: money(subtotal),
    deadCostSubjectToVig: money(subject),
    deadCostNoVig: money(noVig),
    additionalCosts: money(additional),
    ccFees: money(ccFees),
    deadCostTotal,
    deadCostPlusVig,
    profit,
    deadProfitActual,
    commissionPercent: 50,
    commission: money(profit * 0.5),
    vigRate,
  }
}

export const differs = (left: unknown, right: number) => {
  const current = number(left)
  return current == null || Math.abs(current - right) >= 0.01
}
