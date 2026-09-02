const ids = [
  '1254360000048644158', '1254360000048644193', '1254360000048721101',
  '1254360000048980089', '1254360000048980250', '1254360000048980276',
  '1254360000048980302', '1254360000049306507',
]
const clean = (value) => value?.trim().replace(/^(["'])(.*)\1$/, '$2') || ''
const dc = clean(process.env.ZOHO_DC) || 'com'
const org = clean(process.env.ZOHO_ORGANIZATION_ID) || '664670946'
const body = new URLSearchParams({
  refresh_token: clean(process.env.ZOHO_REFRESH_TOKEN),
  client_id: clean(process.env.ZOHO_CLIENT_ID),
  client_secret: clean(process.env.ZOHO_CLIENT_SECRET),
  grant_type: 'refresh_token',
})
const tokenResponse = await fetch(`https://accounts.zoho.${dc}/oauth/v2/token`, {
  method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body,
})
const tokenPayload = await tokenResponse.json()
if (!tokenPayload.access_token) throw new Error(`Token refresh failed (${tokenResponse.status})`)
const headers = { Authorization: `Zoho-oauthtoken ${tokenPayload.access_token}` }
const rows = []
for (const id of ids) {
  const response = await fetch(`https://www.zohoapis.${dc}/books/v3/invoices/${id}?organization_id=${org}`, { headers })
  const payload = await response.json()
  if (!response.ok || payload.code !== 0) {
    rows.push({ id, error: payload.message || `HTTP ${response.status}` })
    continue
  }
  const invoice = payload.invoice
  rows.push({
    id,
    invoice_number: invoice.invoice_number,
    date: invoice.date,
    due_date: invoice.due_date,
    status: invoice.status,
    sub_total: Number(invoice.sub_total || 0),
    total: Number(invoice.total || 0),
    balance: Number(invoice.balance || 0),
    shipping_charge: Number(invoice.shipping_charge || 0),
    adjustment: Number(invoice.adjustment || 0),
    salesperson_name: invoice.salesperson_name || null,
    line_item_count: invoice.line_items?.length || 0,
    custom_fields: (invoice.custom_fields || []).map((field) => ({ label: field.label, value: field.value })),
  })
}
console.log(JSON.stringify(rows, null, 2))
