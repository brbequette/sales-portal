const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        items: { not: null }
      }
    });

    console.log(`Checking items structure for all ${invoices.length} invoices...`);
    let keysFound = new Set();
    let samples = [];
    
    for (const inv of invoices) {
      if (inv.items) {
        Object.keys(inv.items).forEach(k => keysFound.add(k));
        const items = inv.items;
        if (items.profit !== undefined || items.cost !== undefined || items.margin !== undefined || items.gross_profit !== undefined || items.salesOrderNumber !== undefined) {
          samples.push({ id: inv.id, items });
        }
      }
    }

    console.log('All unique keys found in Invoice items JSON:', Array.from(keysFound));
    if (samples.length > 0) {
      console.log(`Found ${samples.length} invoices with profit or other extra keys. Sample:`, samples.slice(0, 3));
    } else {
      console.log('No profit, cost, or margin fields found in Invoice items JSON.');
    }

  } catch (error) {
    console.error(error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
