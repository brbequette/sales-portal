/** Shared invoice fee rule: charge 4.5% of grand total when a card was used. */
export function isCardPaymentMode(value: unknown): boolean {
  const mode = String(value || '').toLowerCase().trim()
  if (/ach|e-?check|bank transfer|zelle|cash|money order|credit note|credit from return/.test(mode)) return false
  return /credit card|debit card|square.*card|authorize|stripe|square|forte|leap payment|paypal/.test(mode)
}

export function calculateCardProcessingFee(grandTotal: number, ratePercent = 4.5): number {
  const base = Number.isFinite(grandTotal) && grandTotal >= 0 ? grandTotal : 0
  const totalCents = Math.round((base + Number.EPSILON) * 100)
  const rateBasisPoints = Math.round(ratePercent * 100)
  return Math.round(totalCents * rateBasisPoints / 10000) / 100
}

export function resolveCardFeeBase(doc: Record<string, unknown>, subtotal: number): { base: number; reviewReason?: 'MISSING_GRAND_TOTAL' } {
  const raw = doc?.total_amount ?? doc?.grand_total ?? doc?.total
  const grandTotal = raw == null || raw === '' ? NaN : Number(raw)
  if (Number.isFinite(grandTotal) && grandTotal >= 0) return { base: grandTotal }
  return { base: subtotal, reviewReason: 'MISSING_GRAND_TOTAL' }
}
