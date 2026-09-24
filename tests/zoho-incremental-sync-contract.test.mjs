import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/sync-now/route.ts'), 'utf8')

assert.doesNotMatch(route, /crm\/v3\/(?:Leads|Accounts)[^`]*last_modified_time/)
assert.match(route, /crm\/v3\/Leads[^`]*`, \{[^}]*headers: zohoCrmReadHeaders\(token, tStatus\.lastSyncAt\)/s)
assert.match(route, /crm\/v3\/Accounts[^`]*`, \{[^}]*headers: zohoCrmReadHeaders\(token, tStatus\.lastSyncAt\)/s)
assert.equal((route.match(/zohoBooksSinceParam\(tStatus\.lastSyncAt\)/g) || []).length, 8)

console.log('ZOHO_INCREMENTAL_SYNC_CONTRACT=PASS')
