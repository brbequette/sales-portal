import { getZohoAccessToken } from "./netlify/functions/lib/zoho-auth";

async function main() {
  const token = await getZohoAccessToken();
  const res = await fetch(`https://www.zohoapis.com/crm/v3/settings/fields?module=Accounts`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const data = await res.json();
  const timezoneFields = data.fields.filter((f: any) => f.field_label.toLowerCase().includes('time') || f.api_name.toLowerCase().includes('time'));
  console.log(JSON.stringify(timezoneFields.map((f: any) => ({ api_name: f.api_name, field_label: f.field_label, data_type: f.data_type })), null, 2));
}

main().catch(console.error);
