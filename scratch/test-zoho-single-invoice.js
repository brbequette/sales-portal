const ZOHO_DC = process.env.ZOHO_DC || 'com';
const TEST_INVOICE_ZOHO_ID = '6821836000005148532';

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

async function main() {
  try {
    const token = await getZohoAccessToken();
    console.log("Token acquired!");

    const url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/${TEST_INVOICE_ZOHO_ID}`;
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });
    console.log(`Status: ${res.status} ${res.statusText}`);
    const data = await res.json();
    if (res.ok && data.data && data.data.length > 0) {
      console.log("Invoice Detail keys:", Object.keys(data.data[0]));
      // Check if there's any subform or line item field
      for (const [key, val] of Object.entries(data.data[0])) {
        if (Array.isArray(val)) {
          console.log(`Found Array Field: ${key}`, JSON.stringify(val, null, 2));
        } else if (typeof val === 'object' && val !== null) {
          console.log(`Found Object Field: ${key}`, JSON.stringify(val));
        }
      }
      console.log("\nFull Invoice Detail:", JSON.stringify(data.data[0], null, 2));
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
