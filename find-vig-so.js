const fs = require('fs');

async function main() {
  const envContent = fs.readFileSync('.env', 'utf-8');
  let token = null;
  const params = new URLSearchParams({
    refresh_token: '1000.d502141847d1aecdace061139c0c08b9.78129dd4c72207a59d063a294c0513be',
    client_id: '1000.XW3WINW3H421OTV0PEUGKQ4X7UYVFK',
    client_secret: '0267c0d4b05b6c3061290007135cd499c6ff14cd5d',
    grant_type: 'refresh_token'
  });

  const tokenRes = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
    method: 'POST',
    body: params
  });
  const tokenData = await tokenRes.json();
  token = tokenData.access_token;
  
  const res = await fetch(`https://www.zohoapis.com/books/v3/salesorders?organization_id=664670946&page=1&per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  if (!data.salesorders || !data.salesorders[0]) {
    console.log('No salesorders found or error:', data);
    return;
  }
  const soId = data.salesorders[0].salesorder_id;
  
  const res2 = await fetch(`https://www.zohoapis.com/books/v3/salesorders/${soId}?organization_id=664670946`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data2 = await res2.json();
  console.log('SO Custom Fields:', JSON.stringify(data2.salesorder.custom_fields, null, 2));
}

main().catch(console.error);
