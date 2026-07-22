/**
 * Fetches INV-10905 directly from Zoho Books and shows what cost fields contain
 * and whether purchase_rate is populated on line items.
 */
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const ZOHO_DC  = process.env.ZOHO_DC  || 'com';
const ORG_ID   = process.env.ZOHO_ORGANIZATION_ID || '664670946';
const TOKEN    = process.env.ZOHO_ACCESS_TOKEN;
const REFRESH  = process.env.ZOHO_REFRESH_TOKEN;
const CLIENT_ID     = process.env.ZOHO_CLIENT_ID;
const CLIENT_SECRET = process.env.ZOHO_CLIENT_SECRET;

async function getToken() {
  if (TOKEN) return TOKEN;
  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ refresh_token: REFRESH, client_id: CLIENT_ID, client_secret: CLIENT_SECRET, grant_type: 'refresh_token' }).toString()
  });
  const d = await res.json();
  return d.access_token;
}

(async () => {
  const token = await getToken();
  const base  = `https://www.zohoapis.${ZOHO_DC}/books/v3`;
  const auth  = { Authorization: `Zoho-oauthtoken ${token}` };

  // Search for invoice by number
  const searchRes = await fetch(`${base}/invoices?organization_id=${ORG_ID}&invoice_number=INV-10905`, { headers: auth });
  const searchData = await searchRes.json();
  const inv = searchData.invoices?.[0];
  if (!inv) { console.log('Invoice not found'); return; }

  console.log('Found:', inv.invoice_number, '| Status:', inv.status, '| Date:', inv.date, '| ZohoId:', inv.invoice_id);

  // Fetch full detail
  const detailRes = await fetch(`${base}/invoices/${inv.invoice_id}?organization_id=${ORG_ID}`, { headers: auth });
  const detail = (await detailRes.json()).invoice;

  console.log('\n--- Custom Fields ---');
  for (const f of (detail.custom_fields || [])) {
    console.log(` ${f.label}: ${f.value ?? '(empty)'}`);
  }

  console.log('\n--- Line Items (purchase_rate) ---');
  for (const item of (detail.line_items || [])) {
    console.log(` ${item.name} | qty:${item.quantity} | rate:${item.rate} | purchase_rate:${item.purchase_rate ?? 'MISSING'}`);
  }

  console.log('\n--- Summary ---');
  console.log('sub_total:', detail.sub_total);
  console.log('balance:', detail.balance);
  console.log('salesperson:', detail.salesperson_name);
})();
