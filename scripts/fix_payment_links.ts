import { prisma } from '../src/lib/prisma';
import { getZohoAccessToken } from '../src/lib/zoho-auth';

async function main() {
  const totalPayments = await prisma.payment.count();
  console.log(`Checking ${totalPayments} existing payment records in DB...`);

  const samplePayments = await prisma.payment.findMany({ take: 10, orderBy: { createdAt: 'desc' } });
  console.log('Sample DB Payments:', samplePayments);

  const token = await getZohoAccessToken();
  const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

  // Fetch recent customer payments from Zoho Books
  console.log('Fetching customer payments from Zoho Books API...');
  const res = await fetch(`https://www.zohoapis.com/books/v3/customerpayments?organization_id=${ORG_ID}&page=1&per_page=200&sort_column=date&sort_order=D`, {
    headers: { Authorization: `Zoho-oauthtoken ${token}` }
  });

  const data = await res.json();
  const zohoPayments = data.customerpayments || [];
  console.log(`Fetched ${zohoPayments.length} payments from Zoho Books.`);

  let linkedCount = 0;
  let updatedCount = 0;

  for (const item of zohoPayments) {
    const payZohoId = String(item.payment_id || '');
    if (!payZohoId) continue;

    // Extract invoice number string cleanly (can be string '10848' or array or null)
    let invNum: string | null = null;
    if (typeof item.invoice_numbers === 'string') {
      invNum = item.invoice_numbers.trim();
    } else if (Array.isArray(item.invoice_numbers) && item.invoice_numbers.length > 0) {
      invNum = String(item.invoice_numbers[0]).trim();
    }

    // Try finding matching Invoice in Postgres
    let targetInvoice: any = null;
    if (invNum) {
      targetInvoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { zohoId: invNum },
            { items: { path: ['invoiceNumber'], equals: invNum } },
            { items: { path: ['booksInvoiceId'], equals: invNum } }
          ]
        }
      });
    }

    const paymentData = {
      zohoId: payZohoId,
      invoiceId: targetInvoice ? targetInvoice.id : null,
      invoiceNumber: invNum || item.reference_number || null,
      amount: parseFloat(item.amount || 0),
      date: item.date ? new Date(item.date) : null,
      mode: item.payment_mode || item.payment_mode_formatted || null,
      status: item.payment_status || item.status || 'paid',
      referenceNumber: item.reference_number || null,
      bankCharges: parseFloat(item.bank_charges || 0),
    };

    await prisma.payment.upsert({
      where: { zohoId: payZohoId },
      update: paymentData,
      create: paymentData
    });

    if (targetInvoice) {
      linkedCount++;
      // Also ensure target invoice is marked paid / updated
      await prisma.invoice.update({
        where: { id: targetInvoice.id },
        data: {
          status: 'paid',
          items: typeof targetInvoice.items === 'object' && targetInvoice.items
            ? { ...targetInvoice.items, balance: 0, isPaid: true }
            : { balance: 0, isPaid: true }
        }
      });
    }
    updatedCount++;
  }

  console.log(`Updated ${updatedCount} payments. Successfully linked ${linkedCount} payments to Invoices in DB!`);
  process.exit(0);
}

main().catch(console.error);
