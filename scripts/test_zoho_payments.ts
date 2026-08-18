import { getZohoAccessToken } from '../src/lib/zoho-auth';
import { prisma } from '../src/lib/prisma';

async function main() {
  const token = await getZohoAccessToken();
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

  console.log('Fetching customer payments from Zoho Books...');
  const res = await fetch(`https://www.zohoapis.com/books/v3/customerpayments?organization_id=${ORG_ID}&page=1&per_page=5`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });

  const data = await res.json();
  console.log('Payments response code:', data.code, 'message:', data.message);
  console.log('Sample payment summary:', data.customerpayments?.[0]);

  if (data.customerpayments?.[0]?.payment_id) {
    const payId = data.customerpayments[0].payment_id;
    const detailRes = await fetch(`https://www.zohoapis.com/books/v3/customerpayments/${payId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    });
    const detailData = await detailRes.json();
    console.log('Sample payment detail invoices:', detailData.payment?.invoices);
  }

  process.exit(0);
}

main().catch(console.error);
