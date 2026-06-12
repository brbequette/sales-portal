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
  const token = await getAccessToken();
  const url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/settings/fields?module=CustomModule5001`;
  const res = await fetch(url, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  if (data.fields) {
    console.log("All fields in CustomModule5001:");
    data.fields.forEach(f => {
      console.log(`API Name: ${f.api_name} | Label: ${f.field_label} | Type: ${f.data_type}`);
    });
  } else {
    console.log("Failed to fetch fields:", data);
  }
}
main();
