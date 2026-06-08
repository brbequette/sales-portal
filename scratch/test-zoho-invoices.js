const ZOHO_DC = process.env.ZOHO_DC || 'com';
const TEST_ACCOUNT_ZOHO_ID = '6821836000000662407'; // HARRIS CONCRETE from DB

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

async function tryQuery(url, token, label) {
  console.log(`\n--- Querying ${label} ---`);
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
        console.log("Sample Record fields:", Object.keys(data.data[0]));
        console.log("Sample Record:", JSON.stringify(data.data[0], null, 2));
      } else {
        console.log("Empty data returned:", JSON.stringify(data, null, 2));
      }
      return data;
    } else {
      console.log(`Error Response:`, JSON.stringify(data, null, 2));
    }
  } catch (e) {
    console.log(`Exception: ${e.message}`);
  }
  return null;
}

async function main() {
  try {
    console.log("Refreshing Zoho Access Token...");
    const token = await getZohoAccessToken();
    console.log("Token acquired!");

    // 1. Try querying standard Invoices
    await tryQuery(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Invoices?fields=id,Subject,Invoice_Number`, token, "Standard Invoices with fields param");
    await tryQuery(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Invoices/search?criteria=(Account_Name:equals:${TEST_ACCOUNT_ZOHO_ID})`, token, "Standard Invoices Search by Account_Name");

    // 2. Try querying CustomModule5001 (Invoice)
    await tryQuery(`https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001?per_page=2`, token, "CustomModule5001 (Invoice) List");
    await tryQuery(`https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Account_Name:equals:${TEST_ACCOUNT_ZOHO_ID})`, token, "CustomModule5001 Search by Account_Name");
    await tryQuery(`https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001/search?criteria=(Account:equals:${TEST_ACCOUNT_ZOHO_ID})`, token, "CustomModule5001 Search by Account");

  } catch (e) {
    console.error("Error in main:", e);
  }
}

main();
