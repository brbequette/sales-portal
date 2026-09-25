import { isDeepStrictEqual } from 'node:util'

// A scheduled recalculation may touch only derived fields. Re-read its version,
// but retain the original guard if any source or ownership field changed.
const derived = new Set(['updatedAt', 'appModifiedAt', 'costsCalculatedAt',
  'computedProfit', 'computedDeadProfit', 'computedDeadCost', 'computedVigRate',
  'computedUpfront', 'computedFinal'])
export function unchangedInvoiceInputs(original, current) {
  if (!original || !current || current.syncConflict) return false
  const normalized = JSON.parse(JSON.stringify(current))
  return Object.keys(normalized).every(key => derived.has(key) || isDeepStrictEqual(normalized[key], original[key]))
}
