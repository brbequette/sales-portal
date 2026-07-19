import { PrismaClient } from '@prisma/client';
import { getZohoAccessToken } from '../netlify/functions/lib/zoho-auth.ts';

const prisma = new PrismaClient();
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

async function run() {
  console.log('Starting Vendor Sync...');
  const token = await getZohoAccessToken();
  if (!token) throw new Error('No token');

  let page = 1;
  let hasMore = true;
  let synced = 0;

  while (hasMore) {
    const res = await fetch(`https://www.zohoapis.com/books/v3/contacts?organization_id=${ORG_ID}&contact_type=vendor&page=${page}&per_page=200`, {
      headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
    });
    const data = await res.json();
    
    if (data.code !== 0) {
      console.error('Zoho Error:', data.message);
      break;
    }

    const contacts = data.contacts || [];
    for (const c of contacts) {
      // Fetch full details
      const detailRes = await fetch(`https://www.zohoapis.com/books/v3/contacts/${c.contact_id}?organization_id=${ORG_ID}`, {
        headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
      });
      const detailData = await detailRes.json();
      const vendor = detailData.contact;
      
      if (!vendor) continue;

      await prisma.vendor.upsert({
        where: { zohoId: vendor.contact_id },
        update: {
          contactName: vendor.contact_name,
          companyName: vendor.company_name,
          email: vendor.email,
          phone: vendor.phone,
          currencyId: vendor.currency_id,
          paymentTerms: vendor.payment_terms,
          billingAddress: vendor.billing_address,
          shippingAddress: vendor.shipping_address,
          customFields: vendor.custom_fields,
          status: vendor.status
        },
        create: {
          zohoId: vendor.contact_id,
          contactName: vendor.contact_name,
          companyName: vendor.company_name,
          email: vendor.email,
          phone: vendor.phone,
          currencyId: vendor.currency_id,
          paymentTerms: vendor.payment_terms,
          billingAddress: vendor.billing_address,
          shippingAddress: vendor.shipping_address,
          customFields: vendor.custom_fields,
          status: vendor.status
        }
      });
      synced++;
    }

    hasMore = data.page_context?.has_more_page;
    page++;
    
    // rate limit
    await new Promise(r => setTimeout(r, 1000));
  }

  console.log(`Successfully synced ${synced} vendors!`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
