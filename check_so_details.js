const fs = require('fs');
const path = require('path');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const env = fs.readFileSync(envPath, 'utf8');
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
    console.log('Got access token successfully.');
    
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`;
    console.log(`Searching for SO 46507 in Org ${ORG_ID}...`);
    
    const searchRes = await fetch(`${baseUrl}/salesorders?salesorder_number=46507&organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const searchData = await searchRes.json();
    console.log('Search Result:', JSON.stringify(searchData, null, 2));

    if (searchData.salesorders && searchData.salesorders.length > 0) {
      const soId = searchData.salesorders[0].salesorder_id;
      console.log(`Found SO ID: ${soId}. Fetching full details...`);
      const detailRes = await fetch(`${baseUrl}/salesorders/${soId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const detailData = await detailRes.json();
      console.log('Detail Result:', JSON.stringify(detailData, null, 2));
    }
  } catch (error) {
    console.error(error);
  }
}

main();
