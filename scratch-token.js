const fs = require('fs');

async function getZohoAccessToken() {
  const refreshToken = process.env.ZOHO_SMS_REFRESH_TOKEN || process.env.ZOHO_REFRESH_TOKEN || "1000.99ec39ee737cf6cd25cbefd1d5f35542.4839cf9e3e7f4c45b73673c683b58402";
  if (!refreshToken) return null;
  const params = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: process.env.ZOHO_SMS_CLIENT_ID || process.env.ZOHO_CLIENT_ID || "1000.08XF8Q00X7LXYT7EKS96TY7TGE4FMD",
    client_secret: process.env.ZOHO_SMS_CLIENT_SECRET || process.env.ZOHO_CLIENT_SECRET || "143003027b4094a97b0a701b22e11a2fcdb5d9282d",
    grant_type: "refresh_token",
  })
  
  try {
    const res = await fetch(`https://accounts.zoho.com/oauth/v2/token`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
    })
    const data = await res.json()
    console.log("Token Data:", data)
    return data.access_token
  } catch (e) {
    console.error("Error refreshing Zoho Token:", e)
    return null
  }
}

getZohoAccessToken();
