import { PrismaClient } from '/app/node_modules/@prisma/client/index.js'

const APPLY_TOKEN = 'AUGUST-2026'
const shouldApply = process.argv[2] === '--apply' && process.argv[3] === APPLY_TOKEN
const prisma = new PrismaClient()
const clean = (value) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || ''

async function zohoToken() {
  const dc = clean(process.env.ZOHO_DC) || 'com'
  const body = new URLSearchParams({
    refresh_token: clean(process.env.ZOHO_REFRESH_TOKEN),
    client_id: clean(process.env.ZOHO_CLIENT_ID),
    client_secret: clean(process.env.ZOHO_CLIENT_SECRET),
    grant_type: 'refresh_token',
  })
  const response = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  })
  const payload = await response.json()
  if (!response.ok || !payload.access_token) throw new Error(`Zoho token refresh failed (${response.status})`)
  return { token: payload.access_token, dc }
}

async function main() {
  const { token, dc } = await zohoToken()
  const org = clean(process.env.ZOHO_ORGANIZATION_ID) || '664670946'
  const query = new URLSearchParams({
    organization_id: org,
    date_start: '2026-08-01',
    date_end: '2026-08-31',
    per_page: '200',
  })
  const response = await fetch(`https://www.zohoapis.${dc}/books/v3/invoices?${query}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const payload = await response.json()
  if (!response.ok || payload.code !== 0) throw new Error(`Zoho invoice list failed (${response.status})`)

  const zohoInvoices = payload.invoices || []
  const existing = new Set((await prisma.invoice.findMany({
    where: { zohoId: { in: zohoInvoices.map((row) => String(row.invoice_id)) } },
    select: { zohoId: true },
  })).map((row) => row.zohoId))
  const missing = zohoInvoices.filter((row) => !existing.has(String(row.invoice_id)))
  const accounts = await prisma.account.findMany({ select: { id: true, zohoId: true, name: true } })
  const byZohoId = new Map(accounts.filter((row) => row.zohoId).map((row) => [String(row.zohoId), row.id]))
  const byName = new Map(accounts.map((row) => [row.name.trim().toLowerCase(), row.id]))

  const report = []
  for (const invoice of missing) {
    const accountId = byZohoId.get(String(invoice.customer_id))
      || byName.get(String(invoice.customer_name || '').trim().toLowerCase())
    report.push({
      invoiceNumber: invoice.invoice_number,
      zohoId: String(invoice.invoice_id),
      accountResolved: Boolean(accountId),
      action: shouldApply && accountId ? 'created' : shouldApply ? 'blocked-no-account' : 'dry-run',
    })
    if (!shouldApply || !accountId) continue
    await prisma.invoice.create({
      data: {
        zohoId: String(invoice.invoice_id),
        accountId,
        amount: Number(invoice.sub_total || 0),
        status: String(invoice.status || 'draft'),
        issueDate: new Date(`${invoice.date}T12:00:00.000Z`),
        dueDate: invoice.due_date ? new Date(`${invoice.due_date}T12:00:00.000Z`) : null,
        invoiceNumber: String(invoice.invoice_number || ''),
        computedInvoiceNumber: String(invoice.invoice_number || ''),
        computedSalesperson: invoice.salesperson_name ? String(invoice.salesperson_name).trim() : null,
        balance: Number(invoice.balance || 0),
        paymentMade: Number(invoice.payment_made || 0),
        lastZohoModifiedTime: invoice.last_modified_time ? new Date(invoice.last_modified_time) : null,
        zohoModifiedTime: invoice.last_modified_time ? new Date(invoice.last_modified_time) : null,
        pendingZohoFetch: true,
        pendingCostSync: true,
        items: {
          booksInvoiceId: String(invoice.invoice_id),
          invoiceNumber: String(invoice.invoice_number || ''),
          customer_name: invoice.customer_name || null,
          salesperson: invoice.salesperson_name ? String(invoice.salesperson_name).trim().toUpperCase() : null,
          sub_total: Number(invoice.sub_total || 0),
          balance: Number(invoice.balance || 0),
        },
      },
    })
  }
  console.log(JSON.stringify({ mode: shouldApply ? 'apply' : 'dry-run', zohoCount: zohoInvoices.length, missingCount: missing.length, report }, null, 2))
  if (shouldApply && report.some((row) => !row.accountResolved)) process.exitCode = 2
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
