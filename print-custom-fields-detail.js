const fs = require('fs');
const path = require('path');

const legacyEnvPath = path.join(__dirname, '..', '.env');
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
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

async function getAccessToken() {
  if (process.env.ZOHO_REFRESH_TOKEN && process.env.ZOHO_CLIENT_ID && process.env.ZOHO_CLIENT_SECRET) {
    try {
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
    } catch (e) {
      console.warn(e);
    }
  }
  return process.env.ZOHO_ACCESS_TOKEN;
}

async function main() {
  try {
    const token = await getAccessToken();
    const listRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}&per_page=1`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const listData = await listRes.json();
    const invHeader = listData.invoices[0];
    const detailRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${invHeader.invoice_id}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const detailData = await detailRes.json();
    const invoice = detailData.invoice;
    console.log(`Invoice: ${invoice.invoice_number}`);
    console.log('Custom Fields detailed list:');
    invoice.custom_fields.forEach(f => {
      console.log(`- Label: ${f.label}, API Name: ${f.api_name}, Value: ${f.value}, Datatype: ${f.data_type}`);
    });
  } catch (error) {
    console.error(error);
  }
}

main();
