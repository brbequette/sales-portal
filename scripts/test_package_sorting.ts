import { getZohoAccessToken } from '../src/lib/zoho-auth';

async function main() {
  const token = await getZohoAccessToken();
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

  // Test page 1 without sort vs page 1 with sort_column=date&sort_order=D
  const resDefault = await fetch(`https://www.zohoapis.com/books/v3/packages?organization_id=${ORG_ID}&page=1&per_page=5`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const dataDefault = await resDefault.json();

  console.log('Default Page 1 sample package date:', dataDefault.packages?.[0]?.date, dataDefault.packages?.[0]?.package_number);

  const resSorted = await fetch(`https://www.zohoapis.com/books/v3/packages?organization_id=${ORG_ID}&page=1&per_page=5&sort_column=date&sort_order=D`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });
  const dataSorted = await resSorted.json();

  console.log('Sorted DESC Page 1 sample package date:', dataSorted.packages?.[0]?.date, dataSorted.packages?.[0]?.package_number);

  process.exit(0);
}

main().catch(console.error);
