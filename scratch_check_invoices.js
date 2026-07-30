const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  try {
    const invs = await prisma.invoice.findMany({
      take: 1000,
      orderBy: { issueDate: 'desc' }
    });
    const matched = invs.filter(i => {
      const num = i.items?.invoiceNumber || i.items?.invoice_number;
      return ['10927', '10926', '10925'].includes(String(num));
    });
    
    console.log(`Found ${matched.length} matched invoices:`);
    matched.forEach(i => {
      console.log(`Invoice #: ${i.items?.invoiceNumber || i.items?.invoice_number}`);
      console.log(`  amount (grand total): ${i.amount}`);
      console.log(`  sub_total in items: ${i.items?.sub_total}`);
      console.log(`  subTotal in items: ${i.items?.subTotal}`);
      console.log(`  items lineItems length: ${Array.isArray(i.items?.line_items) ? i.items.line_items.length : 'none'}`);
    });
  } catch (err) {
    console.error("Prisma error:", err);
  } finally {
    await prisma.$disconnect();
  }
}

run();
