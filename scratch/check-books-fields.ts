import { getZohoAccessToken } from '../netlify/functions/lib/zoho-auth';

async function main() {
  const token = await getZohoAccessToken();
  const ZOHO_DC = process.env.ZOHO_DC || 'com';
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "846879854";

  console.log("Fetching Zoho Books Contact fields...");
  const booksRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/settings/preferences/customfields?entity=contact&organization_id=${ORG_ID}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const booksData = await booksRes.json();
  if (booksData.customfields) {
    const fields = booksData.customfields.map((f: any) => ({ id: f.customfield_id, label: f.label, type: f.data_type }));
    console.log("Books Contact Custom Fields:", JSON.stringify(fields, null, 2));
  } else {
    console.log("Failed to fetch Books custom fields:", booksData);
  }
}
main();
