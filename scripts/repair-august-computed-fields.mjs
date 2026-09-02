import { PrismaClient } from '/app/node_modules/@prisma/client/default.js'

const APPLY_TOKEN = 'REPAIR-AUGUST-FINANCIALS-2026'
const shouldApply = process.argv[2] === '--apply' && process.argv[3] === APPLY_TOKEN
const prisma = new PrismaClient()
const clean = (value) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || ''
const number = (value) => {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : 0
}
const fieldMap = (invoice) => new Map((invoice.custom_fields || []).map((field) => [String(field.label || '').trim().toUpperCase(), field.value]))

async function main() {
  const dc = clean(process.env.ZOHO_DC) || 'com'
  const org = clean(process.env.ZOHO_ORGANIZATION_ID) || '664670946'
  const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: clean(process.env.ZOHO_REFRESH_TOKEN), client_id: clean(process.env.ZOHO_CLIENT_ID),
      client_secret: clean(process.env.ZOHO_CLIENT_SECRET), grant_type: 'refresh_token',
    }),
  })
  const tokenPayload = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(`Zoho token refresh failed (${tokenResponse.status})`)
  const headers = { Authorization: `Zoho-oauthtoken ${tokenPayload.access_token}` }
  const query = new URLSearchParams({ organization_id: org, date_start: '2026-08-01', date_end: '2026-08-31', per_page: '200' })
  const listResponse = await fetch(`https://www.zohoapis.${dc}/books/v3/invoices?${query}`, { headers })
  const listPayload = await listResponse.json()
  if (!listResponse.ok || listPayload.code !== 0) throw new Error(`Zoho invoice list failed (${listResponse.status})`)

  const report = []
  for (const summary of listPayload.invoices || []) {
    const response = await fetch(`https://www.zohoapis.${dc}/books/v3/invoices/${summary.invoice_id}?organization_id=${org}`, { headers })
    const payload = await response.json()
    if (!response.ok || payload.code !== 0) throw new Error(`Detail fetch failed for ${summary.invoice_number}`)
    const invoice = payload.invoice
    const fields = fieldMap(invoice)
    const commission = number(fields.get('SALES COMMISSION'))
    const isPaid = String(invoice.status || '').toLowerCase() === 'paid' || number(invoice.balance) === 0
    const values = {
      computedDeadCost: number(fields.get('DEAD COST TOTAL')),
      computedDeadProfit: number(fields.get('DEAD PROFIT (ACTUAL)')),
      computedProfit: number(fields.get('PROFIT')),
      computedVigRate: number(fields.get('SALESPERSON VIG')) || 1.3,
      computedSalesperson: String(invoice.salesperson_name || '').trim() || null,
      computedInvoiceNumber: String(invoice.invoice_number || '').trim() || null,
      computedUpfront: commission / 2,
      computedFinal: isPaid ? commission / 2 : 0,
    }
    const local = await prisma.invoice.findUnique({ where: { zohoId: String(summary.invoice_id) } })
    if (!local) throw new Error(`Missing local invoice ${summary.invoice_number}`)
    const changed = Object.entries(values).some(([key, value]) => local[key] !== value)
    if (!changed) continue
    report.push({ invoiceNumber: invoice.invoice_number, ...values })
    if (shouldApply) await prisma.invoice.update({ where: { id: local.id }, data: values })
  }
  console.log(JSON.stringify({ mode: shouldApply ? 'apply' : 'dry-run', checked: listPayload.invoices?.length || 0, changed: report.length, report }, null, 2))
}

try { await main() } finally { await prisma.$disconnect() }
