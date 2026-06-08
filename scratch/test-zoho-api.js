// Using global fetch from Node.js

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
    console.log("Refreshing Zoho Access Token...");
    const token = await getZohoAccessToken();
    console.log("Token acquired successfully!");

    // 1. Try querying modules metadata
    console.log("\nQuerying Zoho CRM Modules...");
    const modulesRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/settings/modules`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (modulesRes.ok) {
      const data = await modulesRes.json();
      console.log("Modules found:", data.modules.map(m => `${m.api_name} (${m.singular_label})`).join(', '));
    } else {
      console.error("Failed to query modules. Status:", modulesRes.status, modulesRes.statusText);
      const text = await modulesRes.text();
      console.error("Error body:", text);
    }

    // 2. Try querying contacts
    console.log("\nQuerying Zoho Contacts (first 5 records)...");
    const contactRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Contacts?per_page=5`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    });

    if (contactRes.ok) {
      const contactData = await contactRes.json();
      console.log("Contacts Count returned:", contactData.data ? contactData.data.length : 0);
      if (contactData.data && contactData.data.length > 0) {
        console.log("Sample Contact fields:", Object.keys(contactData.data[0]));
        console.log("Sample Contact Detail (first record):", JSON.stringify(contactData.data[0], null, 2));
      }
    } else {
      console.error("Failed to query contacts. Status:", contactRes.status, contactRes.statusText);
    }

  } catch (err) {
    console.error("Error in main:", err.message);
  }
}

main();
