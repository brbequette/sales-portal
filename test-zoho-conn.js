const { getZohoAccessToken } = require('./netlify/functions/lib/zoho-auth');

async function test() {
  try {
    console.log("Fetching Zoho Access Token...");
    const token = await getZohoAccessToken();
    console.log("Token retrieved successfully:", token.substring(0, 10) + "...");
    
    const ZOHO_DC = process.env.ZOHO_DC || 'com';
    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts?per_page=1`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    
    console.log("API Status:", res.status);
    const data = await res.json();
    console.log("Data sample keys:", Object.keys(data));
    if (data.data) {
      console.log("Account found:", data.data[0]?.Account_Name || data.data[0]?.name);
    } else {
      console.log("No data returned:", data);
    }
  } catch (err) {
    console.error("Test failed:", err);
  }
}

test();
