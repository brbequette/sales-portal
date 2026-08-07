import { getZohoAccessToken } from "./lib/zoho-auth";


async function main() {
  const token = await getZohoAccessToken();
  const ZOHO_DC = 'com';
  
  const invoiceRes = await fetch(
    `https://www.zohoapis.${ZOHO_DC}/crm/v3/CustomModule5001?per_page=1`,
    { headers: { Authorization: `Zoho-oauthtoken ${token}` } }
  );
  
  if (!invoiceRes.ok) {
    console.error(await invoiceRes.text());
    return;
  }
  
  const data = await invoiceRes.json();
  console.log(JSON.stringify((data as any).data[0], null, 2));
}

main().catch(console.error);
