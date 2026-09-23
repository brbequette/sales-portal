async function main() {
  const required = (name) => {
    const value = process.env[name];
    if (!value) throw new Error(`Missing required environment variable: ${name}`);
    return value;
  };
  const code = required('ZOHO_AUTHORIZATION_CODE');
  const clientId = required('ZOHO_CLIENT_ID');
  const clientSecret = required('ZOHO_CLIENT_SECRET');
  const redirectUri = required('ZOHO_REDIRECT_URI');
  
  const params = new URLSearchParams({
    code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: redirectUri,
    grant_type: 'authorization_code'
  });

  const res = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
    method: 'POST',
    body: params
  });
  
  const data = await res.json();
  if (!res.ok || !data.access_token) throw new Error(`Zoho token exchange failed (${res.status})`);
  console.log('Zoho token exchange succeeded. Store the returned credentials in the approved secret manager; token values are intentionally not printed.');
}

main().catch(console.error);
