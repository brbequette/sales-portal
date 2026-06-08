const ZOHO_DC = process.env.ZOHO_DC || 'com';

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

    // Search invoices with a dummy criteria or get list of custom module (requires fields parameter)
    // Wait! Let's query using the custom module list endpoint but with fields parameter!
    // What fields are available? We know: id, Name, Owner, Account_Name, Grand_Total, Status, Invoice_Date, Due_Date, Invoice_ID
    const url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001?fields=id,Name,Owner,Account_Name,Grand_Total,Status,Invoice_Date,Due_Date,Invoice_ID&per_page=10`;
    console.log("Querying url:", url);
    const res = await fetch(url, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    console.log("Status:", res.status, res.statusText);
    if (res.ok) {
      const data = await res.json();
      console.log(`Successfully retrieved ${data.data ? data.data.length : 0} invoices.`);
      if (data.data && data.data.length > 0) {
        console.log("Sample records:");
        data.data.forEach((inv, i) => {
          console.log(`[${i+1}] Invoice #${inv.Name}:`);
          console.log(`    - ID: ${inv.id}`);
          console.log(`    - Owner: ${inv.Owner?.name} (${inv.Owner?.id})`);
          console.log(`    - Account: ${inv.Account_Name?.name} (${inv.Account_Name?.id})`);
          console.log(`    - Status: ${inv.Status}`);
          console.log(`    - Total: $${inv.Grand_Total}`);
        });
      }
    } else {
      console.log("Error body:", await res.text());
    }
  } catch (e) {
    console.error("Error:", e);
  }
}

main();
