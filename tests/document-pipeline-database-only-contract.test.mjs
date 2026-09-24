import assert from 'node:assert/strict'
import fs from 'node:fs'

const read = relative => fs.readFileSync(new URL(`../${relative}`, import.meta.url), 'utf8')
const details = read('netlify/functions/get-invoice-details.ts')
const pdf = read('netlify/functions/get-invoice-pdf.ts')
const documents = read('src/app/api/get-documents/route.ts')
const pipeline = read('src/components/DealPipeline.tsx')
const processing = read('src/app/processing/page.tsx')
const invoiceHook = read('src/components/useInvoiceDetailsData.ts')
const shippingPo = read('src/app/api/shipping/po-details/route.ts')

for (const [name, source] of Object.entries({ details, pdf, documents, shippingPo })) {
  assert.doesNotMatch(source, /getZohoAccessToken|zohoapis\.|zoho-auth|syncRecentBooksInvoices/, `${name} reaches Zoho`)
}
assert.match(details, /LOCAL_DATA_INCOMPLETE/)
assert.match(pdf, /LOCAL_DATA_INCOMPLETE/)
assert.match(documents, /const maxPageSize = 200/)
assert.match(documents, /databaseReadHeaders/)
assert.match(pipeline, /setDeals\(\[\]\)/)
assert.match(processing, /setItems\(\[\]\);setSelectedId\(''\)/)
assert.doesNotMatch(invoiceHook, /[?&]force=true/)
assert.doesNotMatch(invoiceHook, /setTimeout\(\(\) => \{\s*handleProcessCosts/)

console.log('DOCUMENT_READS_POSTGRESQL_ONLY=PASS')
console.log('PIPELINE_FAILURES_CLEAR_STALE_VALUES=PASS')
console.log('DRILLDOWN_MISSING_EVIDENCE_FAILS_CLOSED=PASS')
