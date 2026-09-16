import assert from 'node:assert/strict'
import fs from 'node:fs'

const hook = fs.readFileSync(new URL('../src/components/useGlobalTopBarData.ts', import.meta.url), 'utf8')
const route = fs.readFileSync(new URL('../src/app/api/zoho-invoices/route.ts', import.meta.url), 'utf8')

assert.match(hook, /fetch\("\/api\/zoho-invoices\?summary=true", \{ cache: "no-store" \}\)/)
assert.match(hook, /if \(!summary\) \{\s*setStripStats\(null\)/)
assert.match(hook, /catch \{\s*setStripStats\(null\)/)
assert.match(route, /Cache-Control': 'private, no-store, max-age=0, must-revalidate'/)
assert.match(route, /status: 500/)
assert.match(route, /scopeGlobalHeaderDocuments/)

console.log('GLOBAL_HEADER_NO_STORE=PASS')
console.log('GLOBAL_HEADER_FAIL_CLOSED=PASS')
console.log('GLOBAL_HEADER_ROLE_SCOPE=PASS')
