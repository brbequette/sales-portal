async function main() {
  const params = new URLSearchParams({
    refresh_token: '1000.a6c78bb1ddd3519f9d55dc01fe7b10c2.b89f59150ce88c25240f4410903c143c',
    client_id: '1000.XW3WINW3H421OTV0PEUGKQ4X7UYVFK',
    client_secret: '0267c0d4b05b6c3061290007135cd499c6ff14cd5d',
    grant_type: 'refresh_token'
  });

  const tokenRes = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
    method: 'POST',
    body: params
  });
  const tokenData = await tokenRes.json();
  const token = tokenData.access_token;
  
  const res = await fetch(`https://www.zohoapis.com/crm/v3/Accounts?page=1&per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  console.log('API Response:', JSON.stringify(data, null, 2));
  console.log('Timezone field value:', data.data[0].Time_Zone);
}

main().catch(console.error);
