import { getZohoAccessToken } from "./netlify/functions/lib/zoho-auth.js";

async function main() {
  const token = await getZohoAccessToken();
  const orgs = ['747986877', '685934575', '664670946'];

  for (const ORG_ID of orgs) {
    console.log(`\nTrying ORG_ID: ${ORG_ID}`);
    const searchRes = await fetch(`https://www.zohoapis.com/books/v3/invoices?organization_id=${ORG_ID}&invoice_number=10920`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const searchData = await searchRes.json();
    console.log('Code:', searchData.code, 'Message:', searchData.message, 'Count:', searchData.invoices?.length);

    if (searchData.invoices && searchData.invoices.length > 0) {
      const invId = searchData.invoices[0].invoice_id;
      const detailRes = await fetch(`https://www.zohoapis.com/books/v3/invoices/${invId}?organization_id=${ORG_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const detailData = await detailRes.json();
      const inv = detailData.invoice;
      console.log(`\n================ INVOICE ${inv.invoice_number} (ID: ${inv.invoice_id}) ================`);
      console.log('Header Custom Fields:', JSON.stringify(inv.custom_fields, null, 2));
      
      inv.line_items.forEach((item, idx) => {
        console.log(`\n---------------- Item ${idx+1}: ${item.name} (${item.sku}) ----------------`);
        console.log('line_item_id:', item.line_item_id || item.item_id);
        console.log('item_custom_fields:', JSON.stringify(item.item_custom_fields, null, 2));
        console.log('custom_fields:', JSON.stringify(item.custom_fields, null, 2));
        console.log('Direct properties with cf/markup/vig:');
        for (const k of Object.keys(item)) {
          if (k.toLowerCase().includes('cf') || k.toLowerCase().includes('markup') || k.toLowerCase().includes('vig')) {
            console.log(`  ${k}:`, item[k]);
          }
        }
      });
      break;
    }
  }
}
main();
