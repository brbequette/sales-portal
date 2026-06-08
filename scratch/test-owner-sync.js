const ZOHO_DC = process.env.ZOHO_DC || 'com';
const TEST_OWNER_ID = '6821836000000636001'; // RICHARD GRIFFIN from test output

async function getZohoAccessToken() {
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
  if (data.access_token) {
    return data.access_token;
  }
  throw new Error('Failed to refresh token: ' + JSON.stringify(data));
}

async function trySearch(module, criteria, token) {
  const url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/${module}/search?criteria=${encodeURIComponent(criteria)}`;
  console.log(`\nQuerying ${module} search...`);
  console.log(`URL: ${url}`);
  try {
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (res.ok) {
      console.log(`Success! Data length: ${data.data ? data.data.length : 0}`);
      if (data.data && data.data.length > 0) {
        console.log(`First record keys:`, Object.keys(data.data[0]).slice(0, 15));
      }
      return data.data || [];
    } else {
      console.log(`Error Response:`, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.log(`Exception: ${e.message}`);
  }
  return [];
}

async function main() {
  try {
    const token = await getZohoAccessToken();
    console.log("Token acquired!");

    // Test searching Invoices by Owner
    await trySearch("CustomModule5001", `(Owner.id:equals:${TEST_OWNER_ID})`, token);

    // Test searching Contacts by Owner
    await trySearch("Contacts", `(Owner.id:equals:${TEST_OWNER_ID})`, token);

    // Test searching Deals by Owner
    await trySearch("Deals", `(Owner.id:equals:${TEST_OWNER_ID})`, token);

  } catch (e) {
    console.error("Error in main:", e);
  }
}

main();
