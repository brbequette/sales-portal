const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    // 1. Fetch all deals to find which ones to delete
    const deals = await prisma.deal.findMany({
      include: {
        account: {
          include: {
            invoices: true
          }
        }
      }
    });

    console.log(`Deals count before deletion: ${deals.length}`);

    // 2. Identify deals to delete using the exact same criteria:
    // - Name contains "EST-" or stage contains "estimate"
    // - Closing date is before 2026
    // - No matching invoice exists (matching by docNum parsed from deal name)
    const toDeleteIds = [];
    const details = [];

    for (const deal of deals) {
      const isEstimate = deal.name.includes('EST-') || (deal.stage && deal.stage.toLowerCase().includes('estimate'));
      if (!isEstimate) continue;

      const closingDate = deal.closingDate ? new Date(deal.closingDate) : null;
      if (!closingDate || closingDate.getFullYear() >= 2026) continue;

      const parts = deal.name.split('|');
      let docNum = null;
      if (parts.length >= 2) {
        docNum = parts[1].trim().replace('EST-', '').replace('SO-', '');
      }

      const invoicesOnAccount = deal.account?.invoices || [];
      let hasMatchingInvoice = false;

      if (docNum) {
        hasMatchingInvoice = invoicesOnAccount.some(inv => {
          const items = inv.items;
          const invNum = (items && (items.invoiceNumber || items.invoice_number)) || '';
          return invNum === docNum || inv.zohoId.endsWith(docNum);
        });
      }

      if (!hasMatchingInvoice) {
        toDeleteIds.push(deal.id);
        details.push({ id: deal.id, name: deal.name, stage: deal.stage, closingDate: deal.closingDate });
      }
    }

    console.log(`Found ${toDeleteIds.length} stale estimate deals matching deletion criteria.`);

    if (toDeleteIds.length > 0) {
      // 3. Perform delete operation
      const deleteResult = await prisma.deal.deleteMany({
        where: {
          id: {
            in: toDeleteIds
          }
        }
      });
      console.log(`Successfully deleted ${deleteResult.count} deals.`);
    } else {
      console.log('No deals matched deletion criteria.');
    }

    // 4. Verify remaining count
    const remainingCount = await prisma.deal.count();
    console.log(`Deals count after deletion: ${remainingCount}`);

  } catch (error) {
    console.error('Error during deletion:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
