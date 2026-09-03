export type ReviewStatus = 'OPEN' | 'RESOLVED' | 'DISMISSED'
export interface TariffReversal { amount: number; cumulative: number; capped: boolean; reviewRequired: boolean }

export function calculateTariffReversal(originalTariff: number, allocatedTariff: number, originalQty: number, returnedQty: number, alreadyReversed = 0): TariffReversal {
  if (originalQty <= 0 || returnedQty <= 0 || allocatedTariff <= 0) return { amount: 0, cumulative: alreadyReversed, capped: false, reviewRequired: true }
  const requested = Number((allocatedTariff * (returnedQty / originalQty)).toFixed(2))
  const remaining = Math.max(0, Number((originalTariff - alreadyReversed).toFixed(2)))
  const amount = Math.min(requested, remaining)
  return { amount: Number(amount.toFixed(2)), cumulative: Number((alreadyReversed + amount).toFixed(2)), capped: amount < requested, reviewRequired: false }
}

export function shouldGatePayout(openReviewCount: number): boolean { return openReviewCount > 0 }
