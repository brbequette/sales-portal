import fs from 'node:fs'
import { PrismaClient } from '@prisma/client'

const envPath = process.argv[2]
if (!envPath) throw new Error('ENVIRONMENT_FILE_REQUIRED')
for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
  const match = line.match(/^([A-Z][A-Z0-9_]*)=(.*)$/)
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].trim().replace(/^(["'])(.*)\1$/, '$2')
}
const folder = 'artifacts/invoice-completion'
fs.mkdirSync(folder, { recursive: true })
const ledgerPath = `${folder}/provider-call-ledger.json`
const ledger = fs.existsSync(ledgerPath) ? JSON.parse(fs.readFileSync(ledgerPath, 'utf8')) : { calls: 0, limit: 14999, attempts: [] }
async function request(url, options, purpose) {
  if (ledger.calls >= ledger.limit) throw new Error('API_BUDGET_EXHAUSTED')
  ledger.calls++
  ledger.attempts.push({ at: new Date().toISOString(), purpose })
  fs.writeFileSync(ledgerPath, JSON.stringify(ledger, null, 2))
  return fetch(url, { ...options, signal: AbortSignal.timeout(30000) })
}
const p = new PrismaClient({ log: [] })
try {
  if (!process.env.ZOHO_CLIENT_ID || !process.env.ZOHO_CLIENT_SECRET || !process.env.ZOHO_REFRESH_TOKEN) throw new Error('PROVIDER_CREDENTIALS_MISSING')
  const dc = process.env.ZOHO_DC || 'com'
  const tokenResponse = await request(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST', body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: process.env.ZOHO_REFRESH_TOKEN, client_id: process.env.ZOHO_CLIENT_ID, client_secret: process.env.ZOHO_CLIENT_SECRET })
  }, 'oauth-refresh')
  const token = await tokenResponse.json()
  if (!tokenResponse.ok || !token.access_token) throw new Error('PROVIDER_AUTH_FAILED')
  const records = []
  let complete = false
  for (let page = 1; page <= 100; page++) {
    const response = await request(`https://www.zohoapis.${dc}/books/v3/invoices?organization_id=${encodeURIComponent(process.env.ZOHO_ORGANIZATION_ID || '664670946')}&per_page=200&page=${page}`, { headers: { Authorization: `Zoho-oauthtoken ${token.access_token}` } }, `invoice-list-page-${page}`)
    const body = await response.json()
    if (!response.ok || body.code !== 0 || !Array.isArray(body.invoices)) throw new Error(`INVOICE_LIST_FAILED_HTTP_${response.status}`)
    records.push(...body.invoices)
    if (body.page_context?.has_more_page === false) { complete = true; break }
    if (body.page_context?.has_more_page !== true) throw new Error('PAGINATION_EVIDENCE_MISSING')
    await new Promise(resolve => setTimeout(resolve, 700))
  }
  if (!complete) throw new Error('INVOICE_LIST_PAGE_LIMIT')
  const local = await p.invoice.findMany({ select: { id: true, zohoId: true, invoiceNumber: true, lastZohoModifiedTime: true, zohoModifiedTime: true, items: true, status: true } })
  const localIds = new Set(local.map(row => String(row.items?.booksInvoiceId || row.zohoId)))
  const providerIds = new Set(records.map(row => String(row.invoice_id)))
  if (providerIds.size !== records.length) throw new Error('DUPLICATE_PROVIDER_IDS')
  const missingLocal = records.filter(row => !localIds.has(String(row.invoice_id))).map(row => ({ invoiceId: row.invoice_id, invoiceNumber: row.invoice_number }))
  const absentProvider = local.filter(row => !providerIds.has(String(row.items?.booksInvoiceId || row.zohoId))).map(row => ({ id: row.id, invoiceNumber: row.invoiceNumber, status: row.status }))
  const summary = { completeEnumeration: true, providerInvoices: records.length, localInvoices: local.length, missingLocal: missingLocal.length, absentProvider: absentProvider.length, apiCalls: ledger.calls, calculationsVerified: false }
  fs.writeFileSync(`${folder}/provider-coverage.json`, JSON.stringify({ observedAt: new Date().toISOString(), summary, missingLocal, absentProvider, records }, null, 2))
  console.log(JSON.stringify(summary))
} catch (error) {
  console.error(JSON.stringify({ error: /^(PROVIDER_|INVOICE_|API_|PAGINATION_|DUPLICATE_)/.test(error.message) ? error.message : error.code || error.name, apiCalls: ledger.calls }))
  process.exitCode = 1
} finally { await p.$disconnect() }
