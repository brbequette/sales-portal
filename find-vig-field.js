async function main() {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  let token = null;
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
  token = tokenData.access_token;
  
  const res = await fetch(`https://www.zohoapis.com/books/v3/invoices?organization_id=664670946&page=1&per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  if (!data.invoices || !data.invoices[0]) {
    console.log('No invoices found or error:', data);
    return;
  }
  const invId = data.invoices[0].invoice_id;
  
  const res2 = await fetch(`https://www.zohoapis.com/books/v3/invoices/${invId}?organization_id=664670946`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data2 = await res2.json();
  console.log('Custom Fields:', JSON.stringify(data2.invoice.custom_fields, null, 2));
}

main().catch(console.error);
