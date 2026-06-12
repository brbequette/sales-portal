const path = require('path');
const fs = require('fs');

const legacyEnvPath = path.join(__dirname, '..', '..', '.env');
if (fs.existsSync(legacyEnvPath)) {
  const env = fs.readFileSync(legacyEnvPath, 'utf8');
  env.split('\n').forEach(line => {
    const parts = line.split('=');
    if (parts.length >= 2) {
      const key = parts[0].trim();
      const val = parts.slice(1).join('=').trim().replace(/^"|"$/g, '');
      process.env[key] = val;
    }
  });
}

const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "846879854";

async function getAccessToken() {
  const params = new URLSearchParams({
    refresh_token: process.env.ZOHO_REFRESH_TOKEN,
    client_id: process.env.ZOHO_CLIENT_ID,
    client_secret: process.env.ZOHO_CLIENT_SECRET,
    grant_type: 'refresh_token',
  });
  const res = await fetch(`https://accounts.zoho.${ZOHO_DC}/oauth/v2/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: params.toString(),
  });
  const data = await res.json();
  return data.access_token;
}

async function main() {
  const token = await getAccessToken();
  console.log("Token acquired.");
  
  // Find a paid invoice first from list
  const listRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&status=paid&per_page=5`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const listData = await listRes.json();
  if (listData.code === 0 && listData.invoices.length > 0) {
    for (const invHeader of listData.invoices) {
      const detailRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${invHeader.invoice_id}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const detailData = await detailRes.json();
      const invoice = detailData.invoice;
      console.log(`Invoice #${invoice.invoice_number} | Payments:`, JSON.stringify(invoice.payments || []));
    }
  } else {
    console.log("Failed to fetch Books invoices:", listData);
  }
}
main();
