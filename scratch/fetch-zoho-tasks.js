require('dotenv').config();

async function getZohoAccessToken() {
  const ZOHO_DC = process.env.ZOHO_DC || 'com';
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

async function run() {
  const token = await getZohoAccessToken();
  if (!token) {
    console.error("No token");
    return;
  }
  
  const res = await fetch(`https://www.zohoapis.com/crm/v3/Tasks?per_page=5`, {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  console.log(JSON.stringify(data, null, 2));
}

run();
