const fs = require('fs');
const path = require('path');

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
    // Search Zoho CRM for CustomModule5001 record named '10768'
    const searchUrl = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Name:equals:10768)`;
    console.log('Searching Zoho CRM for invoice:', searchUrl);
    const listRes = await fetch(searchUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const listData = await listRes.json();
    console.log('CRM Search Results:', JSON.stringify(listData, null, 2));
  } catch (error) {
    console.error(error);
  }
}

main();
