import assert from 'node:assert/strict'
import fs from 'node:fs'

const hook = fs.readFileSync('src/components/useSalesBoardData.ts', 'utf8')
assert.match(hook, /cache:\s*["']no-store["']/)
assert.match(hook, /removeItem\(["']tv_salesboard_cache["']\)/)
assert.doesNotMatch(hook, /const cached = .*tv_salesboard_cache/)
console.log('TV_FRESH_DATA_NO_STORE=PASS')
console.log('TV_STALE_CACHE_INVALIDATION=PASS')
console.log('TV_FAIL_CLOSED_REFRESH=PASS')
