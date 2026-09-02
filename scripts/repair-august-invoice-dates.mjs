import { PrismaClient } from '/app/node_modules/@prisma/client/default.js'

const APPLY_TOKEN = 'REPAIR-AUGUST-DATES-2026'
const shouldApply = process.argv[2] === '--apply' && process.argv[3] === APPLY_TOKEN
const prisma = new PrismaClient()
const clean = (value) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || ''
const dateOnly = (value) => value ? new Date(`${value}T12:00:00.000Z`) : null
const ymd = (value) => value ? new Date(value).toISOString().slice(0, 10) : null

async function main() {
  const dc = clean(process.env.ZOHO_DC) || 'com'
  const org = clean(process.env.ZOHO_ORGANIZATION_ID) || '664670946'
  const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: clean(process.env.ZOHO_REFRESH_TOKEN),
      client_id: clean(process.env.ZOHO_CLIENT_ID),
      client_secret: clean(process.env.ZOHO_CLIENT_SECRET),
      grant_type: 'refresh_token',
    }),
  })
  const tokenPayload = await tokenResponse.json()
  if (!tokenResponse.ok || !tokenPayload.access_token) throw new Error(`Zoho token refresh failed (${tokenResponse.status})`)
  const headers = { Authorization: `Zoho-oauthtoken ${tokenPayload.access_token}` }
  const query = new URLSearchParams({
    organization_id: org,
    date_start: '2026-08-01',
    date_end: '2026-08-31',
    per_page: '200',
  })
  const listResponse = await fetch(`https://www.zohoapis.${dc}/books/v3/invoices?${query}`, { headers })
  const listPayload = await listResponse.json()
  if (!listResponse.ok || listPayload.code !== 0) throw new Error(`Zoho invoice list failed (${listResponse.status})`)

  const report = []
  for (const summary of listPayload.invoices || []) {
    const local = await prisma.invoice.findUnique({
      where: { zohoId: String(summary.invoice_id) },
      select: { id: true, issueDate: true, dueDate: true },
    })
    if (!local) {
      report.push({ invoiceNumber: summary.invoice_number, status: 'missing-local-record' })
      continue
    }
    const detailResponse = await fetch(
      `https://www.zohoapis.${dc}/books/v3/invoices/${summary.invoice_id}?organization_id=${org}`,
      { headers },
    )
    const detailPayload = await detailResponse.json()
    if (!detailResponse.ok || detailPayload.code !== 0) {
      report.push({ invoiceNumber: summary.invoice_number, status: 'detail-fetch-failed' })
      continue
    }
    const invoice = detailPayload.invoice
    const zohoIssue = invoice.date || null
    const zohoDue = invoice.due_date || null
    const issueMismatch = ymd(local.issueDate) !== zohoIssue
    const dueMismatch = ymd(local.dueDate) !== zohoDue
    if (!issueMismatch && !dueMismatch) continue
    report.push({
      invoiceNumber: invoice.invoice_number,
      localIssueDate: ymd(local.issueDate),
      zohoIssueDate: zohoIssue,
      localDueDate: ymd(local.dueDate),
      zohoDueDate: zohoDue,
      status: shouldApply ? 'repaired' : 'dry-run',
    })
    if (shouldApply) {
      await prisma.invoice.update({
        where: { id: local.id },
        data: { issueDate: dateOnly(zohoIssue), dueDate: dateOnly(zohoDue) },
      })
    }
  }
  console.log(JSON.stringify({ mode: shouldApply ? 'apply' : 'dry-run', checked: listPayload.invoices?.length || 0, mismatches: report.length, report }, null, 2))
  if (report.some((row) => row.status === 'missing-local-record' || row.status === 'detail-fetch-failed')) process.exitCode = 2
}

try {
  await main()
} finally {
  await prisma.$disconnect()
}
