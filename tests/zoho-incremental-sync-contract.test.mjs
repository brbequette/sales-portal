import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'

const route = fs.readFileSync(path.join(process.cwd(), 'src/app/api/sync-now/route.ts'), 'utf8')

assert.doesNotMatch(route, /crm\/v3\/(?:Leads|Accounts)[^`]*last_modified_time/)
assert.match(route, /crm\/v3\/Leads[^`]*`[\s\S]*?headers: zohoCrmReadHeaders\(token, tStatus\.lastSyncAt\)/)
assert.match(route, /crm\/v3\/Accounts[^`]*`[\s\S]*?headers: zohoCrmReadHeaders\(token, tStatus\.lastSyncAt\)/)
assert.equal((route.match(/zohoBooksSinceParam\(tStatus\.lastSyncAt\)/g) || []).length, 8)
assert.equal((route.match(/fetchZohoPages<any>/g) || []).length, 10)
assert.equal((route.match(/if \(batch\.length\) \{ await prisma\.\$transaction\(batch\)/g) || []).length, 10)

console.log('ZOHO_INCREMENTAL_SYNC_CONTRACT=PASS')
