const clean = (value) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || ''
const dc = clean(process.env.ZOHO_DC) || 'com'
const org = clean(process.env.ZOHO_ORGANIZATION_ID) || '664670946'
const params = new URLSearchParams({
  refresh_token: clean(process.env.ZOHO_REFRESH_TOKEN),
  client_id: clean(process.env.ZOHO_CLIENT_ID),
  client_secret: clean(process.env.ZOHO_CLIENT_SECRET),
  grant_type: 'refresh_token',
})
const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  body: params,
})
const tokenBody = await tokenResponse.json()
if (!tokenBody.access_token) throw new Error(`Zoho token refresh failed (${tokenResponse.status})`)
const headers = { Authorization: `Zoho-oauthtoken ${tokenBody.access_token}` }
const base = `https://www.zohoapis.${dc}/books/v3`

const invoices = []
for (let page = 1; page <= 20; page += 1) {
  const query = new URLSearchParams({
    organization_id: org,
    date_start: '2026-08-01',
    date_end: '2026-08-31',
    per_page: '200',
    page: String(page),
  })
  const response = await fetch(`${base}/invoices?${query}`, { headers })
  const body = await response.json()
  if (!response.ok || body.code !== 0) throw new Error(`Invoice list failed (${response.status}, code ${body.code})`)
  invoices.push(...(body.invoices || []))
  if (!body.page_context?.has_more_page) break
}

const safeRows = invoices.map((invoice) => ({
  invoice_id: invoice.invoice_id,
  invoice_number: invoice.invoice_number,
  date: invoice.date,
  status: invoice.status,
  customer_name: invoice.customer_name,
  sub_total: Number(invoice.sub_total || 0),
  tax_total: Number(invoice.tax_total || 0),
  adjustment: Number(invoice.adjustment || 0),
  shipping_charge: Number(invoice.shipping_charge || 0),
  total: Number(invoice.total || 0),
  payment_made: Number(invoice.payment_made || 0),
  balance: Number(invoice.balance || 0),
  last_modified_time: invoice.last_modified_time || null,
}))

console.log(JSON.stringify({ count: safeRows.length, invoices: safeRows }, null, 2))
