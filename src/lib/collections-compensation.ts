/** Existing company-wide collections bonus policy; shared with commission statements. */
export const COLLECTIONS_BONUS_START = '2026-06-08'
export const COLLECTIONS_BONUS_TIERS = [
  { minimum: 25000, rate: 0.005 }, { minimum: 37500, rate: 0.0075 }, { minimum: 50000, rate: 0.01 },
]
export function collectionsBonusRate(amount: number) {
  return [...COLLECTIONS_BONUS_TIERS].reverse().find(t => amount >= t.minimum)?.rate || 0
}
/** A collector need not own a sale to receive their configured company bonus. */
export function ensureCollectionsManagerLedger(byRep: Record<string, any>, manager: { id: string; name: string | null } | undefined) {
  if (manager && !byRep[manager.id]) byRep[manager.id] = {
    repId: manager.id, repName: manager.name || 'Collections manager', invoices: [], deals: [], payouts: [],
    totalEarned: 0, totalPaid: 0, totalProfit: 0, totalDeadProfit: 0, totalSales: 0, totalFutures: 0, totalAtRisk: 0, balance: 0,
  }
}
