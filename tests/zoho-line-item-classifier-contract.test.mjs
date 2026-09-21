import assert from 'node:assert/strict'
import fs from 'node:fs'

const criticalReaders = [
  'netlify/functions/lib/cost-calculations.ts',
  'src/lib/cost-calculations.ts',
  'src/lib/sync-engine.ts',
  'netlify/functions/process-invoice-costs.ts',
  'netlify/functions/bulk-process-costs.ts',
  'netlify/functions/batch-tariff-update.ts',
  'src/app/api/batch-tariff-update/route.ts',
  'netlify/functions/easyship-return.ts',
  'netlify/functions/zoho-fulfillment.ts',
  'netlify/functions/shipping.ts',
  'src/app/api/shipping/route.ts',
  'src/app/api/admin/shipping/missing-shipping/route.ts',
  'src/app/api/admin/orphans/suggest-matches/match-score.ts',
  'netlify/functions/get-account-purchases.ts',
  'netlify/functions/get-product-purchases.ts',
  'src/app/api/commissions/monthly-sales-sheet/route.ts',
]

for (const file of criticalReaders) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /financialZohoLineItems/, `${file} must use the shared financial-line classifier`)
}

for (const file of ['netlify/functions/create-transaction.ts', 'netlify/functions/zoho-update-line-items.ts', 'netlify/functions/zoho-apply-discount.ts']) {
  const source = fs.readFileSync(file, 'utf8')
  assert.match(source, /structuralZohoLineItemPayload/, `${file} must preserve structural rows without fake product fields`)
}

const classifier = fs.readFileSync('src/lib/zoho-line-items.ts', 'utf8')
assert.doesNotMatch(classifier, /\bfetch\s*\(/, 'classification must never add a Zoho or network call')
assert.doesNotMatch(classifier, /prisma\./, 'classification must never mutate or query the database')
console.log('Zoho line-item classifier dependency contract passed')
