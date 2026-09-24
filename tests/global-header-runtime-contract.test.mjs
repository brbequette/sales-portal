import assert from 'node:assert/strict'
import fs from 'node:fs'

const hook = fs.readFileSync(new URL('../src/components/useGlobalTopBarData.ts', import.meta.url), 'utf8')
const dashboardHook = fs.readFileSync(new URL('../src/hooks/useDashboardData.ts', import.meta.url), 'utf8')
const dashboardController = fs.readFileSync(new URL('../src/components/useDashboardController.ts', import.meta.url), 'utf8')
const route = fs.readFileSync(new URL('../src/app/api/zoho-invoices/route.ts', import.meta.url), 'utf8')
const databaseMetadata = fs.readFileSync(new URL('../src/lib/database-read-metadata.ts', import.meta.url), 'utf8')
const clientRead = fs.readFileSync(new URL('../src/lib/client-database-reads.ts', import.meta.url), 'utf8')

assert.match(hook, /fetchDatabaseSummary\(\)/)
assert.match(clientRead, /fetch\('\/api\/database-documents\?summary=true', \{ cache: 'no-store' \}\)/)
assert.match(clientRead, /summaryRequest/)
assert.match(hook, /if \(!summary\) \{\s*setStripStats\(null\)/)
assert.match(hook, /catch \{\s*setStripStats\(null\)/)
assert.match(route, /databaseReadHeaders/)
assert.match(databaseMetadata, /'Cache-Control': 'private, no-store, max-age=0, must-revalidate'/)
assert.match(databaseMetadata, /'X-Zoho-Calls': '0'/)
assert.match(route, /status: 500/)
assert.match(route, /scopeGlobalHeaderDocuments/)
assert.match(dashboardHook, /fetchDatabaseSummary\(\)/)
assert.match(dashboardHook, /stats\.scope !== globalHeaderSummary\.scope/)
assert.match(dashboardController, /companyMonthlyTotal = rawData\.globalHeaderSummary\.mtdSales/)
assert.doesNotMatch(dashboardController, /companyMonthlyTotal = companyTotalsKpi\.invoiceSubtotal/)

console.log('GLOBAL_HEADER_NO_STORE=PASS')
console.log('GLOBAL_HEADER_FAIL_CLOSED=PASS')
console.log('GLOBAL_HEADER_ROLE_SCOPE=PASS')
console.log('DASHBOARD_HEADER_MTD_PARITY=PASS')
