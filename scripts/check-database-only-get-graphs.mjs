import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = process.cwd()
const entries = [
  'src/app/api/zoho-invoices/route.ts',
  'src/app/api/database-documents/route.ts',
  'src/app/api/customer/account/route.ts',
  'src/app/api/get-accounts/route.ts',
  'src/app/api/get-documents/route.ts',
  'src/app/api/get-commissions/route.ts',
  'src/app/api/get-rep-stats/route.ts',
  'src/app/api/shipping/route.ts',
  'src/app/api/shipping/po-details/route.ts',
  'src/app/api/get-products/route.ts',
  'src/app/api/get-tasks/route.ts',
  'src/app/api/get-collections/route.ts',
  'src/app/api/global-search/route.ts',
  'src/app/api/get-invoice-details/route.ts',
  'src/app/api/get-invoice-pdf/route.ts',
  'src/app/api/admin/write-off-recovery/health/route.ts',
]
// The NextAuth sign-in configuration contains provider authorization URLs but
// session verification does not refresh application/provider data tokens.
const forbiddenSource = /getZohoAccessToken|zohoapis\.|syncRecentBooksInvoices|collectBoundedBooks|daily-books-sync|sync-now/
const forbiddenPath = /(?:^|\/)(?:zoho-auth|zoho-books|bounded-books-import)(?:\.|\/)/
const importPattern = /(?:import|export)\s+(?:[\s\S]*?\s+from\s+)?['"]([^'"]+)['"]/g

function resolveLocal(from, specifier) {
  if (!specifier.startsWith('.') && !specifier.startsWith('@/')) return null
  const base = specifier.startsWith('@/')
    ? path.join(root, 'src', specifier.slice(2))
    : path.resolve(path.dirname(from), specifier)
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.mjs`, path.join(base, 'index.ts')]) {
    if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) return candidate
  }
  throw new Error(`Cannot resolve ${specifier} from ${path.relative(root, from)}`)
}

function inspect(entry) {
  const visited = new Set()
  const stack = [path.join(root, entry)]
  while (stack.length) {
    const file = stack.pop()
    if (!file || visited.has(file)) continue
    visited.add(file)
    const source = fs.readFileSync(file, 'utf8')
    const relative = path.relative(root, file).replaceAll('\\', '/')
    if (forbiddenSource.test(source) || forbiddenPath.test(relative)) {
      throw new Error(`${entry} reaches provider dependency ${relative}`)
    }
    for (const match of source.matchAll(importPattern)) {
      const dependency = resolveLocal(file, match[1])
      if (dependency) stack.push(dependency)
    }
  }
  return visited.size
}

export function checkDatabaseOnlyGetGraphs() {
  return entries.map(entry => ({ entry, modules: inspect(entry) }))
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  const graphs = checkDatabaseOnlyGetGraphs()
  console.log(JSON.stringify({ status: 'PASS', graphs }, null, 2))
}
