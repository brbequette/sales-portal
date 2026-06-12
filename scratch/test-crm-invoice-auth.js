const path = require('path');
require('ts-node').register({ transpileOnly: true });

const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth');

async function main() {
  const token = await getZohoAccessToken();
  const ZOHO_DC = process.env.ZOHO_DC || 'com';
  console.log("Token acquired:", token.substring(0, 10) + '...');
  
  const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Invoices?per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  if (data.data && data.data.length > 0) {
    const inv = data.data[0];
    console.log("Keys containing vig/cost/comm/breakdown:");
    console.log(Object.keys(inv).filter(k => k.toLowerCase().includes('vig') || k.toLowerCase().includes('cost') || k.toLowerCase().includes('comm') || k.toLowerCase().includes('breakdown') || k.toLowerCase().includes('profit')));
  } else {
    console.log("No invoices found:", data);
  }
}
main();
