import { PrismaClient } from '@prisma/client'
import { getZohoAccessToken } from '../../netlify/functions/lib/zoho-auth'

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com'
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

async function run() {
  console.log("Starting push of CC Fees to Zoho...");
  
  const token = await getZohoAccessToken();
  if (!token) throw new Error("No token");

  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`;

  // Find all invoices where the local DB has a CC fee
  const allInvoices = await prisma.invoice.findMany({
    select: { zohoId: true, items: true, status: true }
  });

  let toUpdate: any[] = [];
  for (const inv of allInvoices) {
    if (!inv.items || !(inv.items as any).custom_fields) continue;
    const cf = (inv.items as any).custom_fields.find((c: any) => c.label && c.label.toUpperCase().includes('CREDIT CARD PROCESSING'));
    if (cf && parseFloat(cf.value) > 0) {
      toUpdate.push({ zohoId: inv.zohoId, ccFee: cf.value, cfId: cf.customfield_id });
    }
  }

  console.log(`Found ${toUpdate.length} invoices to push to Zoho.`);
  let pushedCount = 0;

  for (const inv of toUpdate) {
    try {
      const payload = {
        custom_fields: [
          {
            ...(inv.cfId ? { customfield_id: inv.cfId } : { label: "CREDIT CARD PROCESSING FEES" }),
            value: inv.ccFee
          }
        ]
      };

      const res = await fetch(`${baseUrl}/invoices/${inv.zohoId}?organization_id=${ORG_ID}`, {
        method: 'PUT',
        headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      
      const json = await res.json();
      if (json.code === 0) {
        pushedCount++;
      } else {
        console.error(`Zoho Error on ${inv.zohoId}:`, json.message);
      }
    } catch (e: any) {
      console.error(`Network Error on ${inv.zohoId}:`, e.message);
    }

    if (pushedCount > 0 && pushedCount % 100 === 0) console.log(`Pushed ${pushedCount}...`);
    
    // rate limit: 2 per second
    await new Promise(r => setTimeout(r, 500));
  }
  
  console.log(`Finished pushing ${pushedCount} CC fees to Zoho!`);
}

run().catch(console.error).finally(() => prisma.$disconnect());
