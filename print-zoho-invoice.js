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

let _cachedToken = null;
let _tokenExpiresAt = 0;

async function getAccessToken() {
  const now = Date.now();
  if (_cachedToken && now < _tokenExpiresAt - 5 * 60 * 1000) {
    return _cachedToken;
  }
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
      if (data.access_token) {
        _cachedToken = data.access_token;
        _tokenExpiresAt = now + (data.expires_in || 3600) * 1000;
        return _cachedToken;
      }
    } catch (e) {
      console.warn('Error fetching token:', e.message);
    }
  }
  if (process.env.ZOHO_ACCESS_TOKEN) {
    return process.env.ZOHO_ACCESS_TOKEN;
  }
  throw new Error('No access token available.');
}

async function main() {
  try {
    const token = await getAccessToken();
    const listRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const listData = await listRes.json();
    if (!listData.invoices || listData.invoices.length === 0) {
      console.log('No invoices found in list.');
      return;
    }
    
    // Fetch detailed info for first 3 invoices
    for (let i = 0; i < Math.min(3, listData.invoices.length); i++) {
      const invHeader = listData.invoices[i];
      const detailRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/invoices/${invHeader.invoice_id}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const detailData = await detailRes.json();
      const invoice = detailData.invoice;
      console.log(`\n--- Invoice ${invoice.invoice_number} ---`);
      console.log('Keys:', Object.keys(invoice));
      console.log('Custom Fields:', invoice.custom_fields);
      console.log('Sample Line Item Keys:', invoice.line_items?.[0] ? Object.keys(invoice.line_items[0]) : 'No line items');
      if (invoice.line_items?.[0]) {
        console.log('Sample Line Item Values:', invoice.line_items[0]);
      }
    }
  } catch (error) {
    console.error(error);
  }
}

main();
