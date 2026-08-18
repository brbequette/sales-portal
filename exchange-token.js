async function main() {
  const code = '1000.82d15ea2373db4e08d64f9ce3c1c6182.7a51b6329207275d40780f0ad8a41940';
  const clientId = '1000.XW3WINW3H421OTV0PEUGKQ4X7UYVFK';
  const clientSecret = '0267c0d4b05b6c3061290007135cd499c6ff14cd5d';
  const redirectUri = 'https://titan-sales-portal.netlify.app/api/auth/zoho/callback';
  
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
  console.log('Exchange response:', JSON.stringify(data, null, 2));
}

main().catch(console.error);
