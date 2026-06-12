const { getZohoAccessToken } = require('../netlify/functions/lib/zoho-auth');

async function main() {
  const token = await getZohoAccessToken();
  const ZOHO_DC = process.env.ZOHO_DC || 'com';
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "846879854";

  console.log("Fetching Zoho CRM Account fields...");
  const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/settings/fields?module=Accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const crmData = await crmRes.json();
  if (crmData.fields) {
    const fields = crmData.fields.map(f => ({ api_name: f.api_name, field_label: f.field_label, type: f.data_type, required: f.system_mandatory }));
    console.log("CRM Account Fields:", JSON.stringify(fields.filter(f => f.required || ['quality', 'status', 'industry'].some(k => f.api_name.toLowerCase().includes(k))), null, 2));
  } else {
    console.log("Failed to fetch CRM fields:", crmData);
  }

  console.log("\nFetching Zoho Books Contact fields...");
  const booksRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/settings/preferences/customfields?entity=contact&organization_id=${ORG_ID}`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const booksData = await booksRes.json();
  if (booksData.customfields) {
    const fields = booksData.customfields.map(f => ({ id: f.customfield_id, label: f.label, type: f.data_type }));
    console.log("Books Contact Custom Fields:", JSON.stringify(fields, null, 2));
  } else {
    console.log("Failed to fetch Books custom fields:", booksData);
  }
}
main();
