async function main() {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  const params = new URLSearchParams({
    refresh_token: required('ZOHO_REFRESH_TOKEN'),
    client_id: required('ZOHO_CLIENT_ID'),
    client_secret: required('ZOHO_CLIENT_SECRET'),
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
