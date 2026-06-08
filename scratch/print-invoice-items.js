const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const invoices = await prisma.invoice.findMany({
      take: 10
    });

    console.log('Sample Invoices:');
    invoices.forEach(inv => {
      console.log(`Invoice ID: ${inv.zohoId}`);
      console.log('Items keys:', Object.keys(inv.items || {}));
      console.log('Items sample:', inv.items);
      console.log('---');
    });

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
