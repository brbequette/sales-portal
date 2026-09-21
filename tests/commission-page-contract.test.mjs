import assert from 'node:assert/strict'
import fs from 'node:fs'

const handler = fs.readFileSync('netlify/functions/get-commissions.ts', 'utf8')
const page = fs.readFileSync('src/app/commissions/page.tsx', 'utf8')
const sheet = fs.readFileSync('src/app/commissions/sales-sheet/page.tsx', 'utf8')

assert.match(handler, /classifyCommissionCostQuality\(inv, items\)/, 'invoice totals and rows must use canonical cost quality')
for (const commissionField of ['salesCommission', 'commission', 'cf_commission_amount', 'cf_commision_amount', 'cf_commission_amount_unformatted']) {
  assert.match(handler, new RegExp(`'${commissionField}'`), `SQL projection must preserve ${commissionField}`)
}
assert.match(handler, /costQuality === COMMISSION_COST_QUALITY\.AUTHORITATIVE/, 'financial inclusion must consume canonical cost quality')
assert.match(handler, /usedFallbackCost = false/, 'legacy fallback flags must not override an authoritative snapshot')
assert.match(handler, /"Cache-Control": "private, no-store, max-age=0, must-revalidate"/, 'GET response must remain no-store')
assert.doesNotMatch(handler, /zohoFetch|fetchZoho|zohoRequest|axios/, 'commission page load must not call Zoho')
assert.doesNotMatch(handler, /\.create\(|\.update\(|\.upsert\(|\.delete\(|\$executeRaw/, 'commission GET must not mutate PostgreSQL')
assert.match(page, /invoice\.costQuality === COMMISSION_COST_QUALITY\.BLOCKED/, 'banner must consume canonical row quality')
assert.doesNotMatch(page, /filter\(\(invoice: any\) => invoice\.usedFallbackCost\)/, 'banner must not consume legacy fallback flags')
assert.match(sheet, /inv\.costQuality === 'BLOCKED_MISSING_COST'/, 'sales sheet rows must consume the same quality result')
assert.match(page, /cache: "no-store"/, 'client request must bypass browser cache')

console.log('commission page contracts passed')
