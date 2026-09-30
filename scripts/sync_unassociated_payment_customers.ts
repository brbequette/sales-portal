import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from '../src/lib/zoho-auth';
import { prisma } from '../src/lib/prisma';

async function main() {
  const token = await getZohoAccessToken();
  if (!token) {
    console.error('Failed to get Zoho token');
    return;
  }

  const unassociatedPayments = await prisma.payment.findMany({
    where: { invoiceId: null }
  });

  console.log(`Found ${unassociatedPayments.length} unassociated payments.`);

  let updatedCount = 0;

  for (const pmt of unassociatedPayments) {
    try {
      const res = await fetch(`https://www.zohoapis.com/books/v3/customerpayments/${pmt.zohoId}?organization_id=${ZOHO_ORGANIZATION_ID}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      });
      const data = await res.json();
      if (data.code === 0 && data.payment) {
        const cName = data.payment.customer_name || '';
        const cId = data.payment.customer_id || '';
        const existingDesc = pmt.description || '';
        
        let newDesc = existingDesc;
        if (cName) {
          if (!existingDesc.includes('Customer:')) {
            newDesc = `Customer: ${cName}${existingDesc ? ' | ' + existingDesc : ''}`;
          }
        }

        // Also check if Zoho has invoices attached that were not linked locally!
        let invIdToLink = pmt.invoiceId;
        let invNumberToLink = pmt.invoiceNumber;
        if (!invIdToLink && data.payment.invoices && data.payment.invoices.length > 0) {
          invIdToLink = data.payment.invoices[0].invoice_id || null;
          invNumberToLink = data.payment.invoices[0].invoice_number || null;
        }

        await prisma.payment.update({
          where: { id: pmt.id },
          data: {
            description: newDesc,
            ...(invIdToLink ? { invoiceId: String(invIdToLink) } : {}),
            ...(invNumberToLink ? { invoiceNumber: String(invNumberToLink) } : {})
          }
        });
        updatedCount++;
        console.log(`Updated payment ${pmt.zohoId}: ${newDesc}`);
      }
      await new Promise(r => setTimeout(r, 200));
    } catch (e: any) {
      console.error(`Error updating payment ${pmt.zohoId}:`, e.message);
    }
  }

  console.log(`Successfully updated ${updatedCount} payments with customer info.`);
}

main().catch(console.error).finally(() => prisma.$disconnect());
