/** Existing company-wide collections bonus policy; shared with commission statements. */
export const COLLECTIONS_BONUS_START = '2026-06-08'
export const COLLECTIONS_BONUS_TIERS = [
  { minimum: 25000, rate: 0.005 }, { minimum: 37500, rate: 0.0075 }, { minimum: 50000, rate: 0.01 },
]
export function collectionsBonusRate(amount: number) {
  return [...COLLECTIONS_BONUS_TIERS].reverse().find(t => amount >= t.minimum)?.rate || 0
}
