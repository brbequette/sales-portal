import { getZohoAccessToken } from "../netlify/functions/lib/zoho-auth";

async function testApi() {
  const token = await getZohoAccessToken();
  const ZOHO_DC = process.env.ZOHO_DC || "com";
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`;

  // Try to hit /estimates
  const estRes = await fetch(`${baseUrl}/estimates?organization_id=${ORG_ID}&per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const estData = await estRes.json();
  const estimate = estData.estimates?.[0];
  console.log("Estimate:", estimate ? estimate.estimate_id : "None found");

  // Try to hit /salesorders
  const soRes = await fetch(`${baseUrl}/salesorders?organization_id=${ORG_ID}&per_page=1`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const soData = await soRes.json();
  const so = soData.salesorders?.[0];
  console.log("Sales Order:", so ? so.salesorder_id : "None found");
}

testApi().catch(console.error);
