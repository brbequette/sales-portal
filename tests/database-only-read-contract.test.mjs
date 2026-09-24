import assert from 'node:assert/strict'
import fs from 'node:fs'
import path from 'node:path'
import { checkDatabaseOnlyGetGraphs } from '../scripts/check-database-only-get-graphs.mjs'

const root = process.cwd()
const pages = fs.readdirSync(path.join(root, 'src/app'), { recursive: true }).filter((file) => String(file).endsWith('.tsx'))
for (const file of pages) {
  const source = fs.readFileSync(path.join(root, 'src/app', file), 'utf8')
  assert.doesNotMatch(source, /zohoapis\.|getZohoAccessToken|from ['"].*zoho-auth/, `page imports Zoho provider: ${file}`)
}
const inventory = JSON.parse(fs.readFileSync(path.join(root, 'docs/zoho-call-site-inventory.json'), 'utf8'))
assert.ok(Array.isArray(inventory.entries) && inventory.entries.length > 0)
assert.match(fs.readFileSync(path.join(root, 'docs/zoho-call-site-audit.md'), 'utf8'), /Local PostgreSQL is the only runtime read source/)
const graphs = checkDatabaseOnlyGetGraphs()
assert.equal(graphs.length, 16)
assert.ok(graphs.every(graph => graph.modules > 0))
console.log('DATABASE_ONLY_PAGE_CONTRACT=PASS')
console.log('ZOHO_CALL_SITE_INVENTORY=PASS')
console.log('PROVIDER_IMPORT_GUARD=PASS')
console.log('USER_FACING_GET_DEPENDENCY_GRAPHS=PASS')
