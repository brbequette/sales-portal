import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const targetId = '1254360000049306305';
  console.log(`Searching for ${targetId} in the database...`);

  const salesOrders = await prisma.salesOrder.findMany({
    select: { id: true, zohoId: true, amount: true }
  });
  console.log(`Total Sales Orders:`, salesOrders.length);
  for (const s of salesOrders) {
    if (s.zohoId?.includes('4930630')) {
      console.log(`Sales Order match:`, s);
    }
  }

  const quotes = await prisma.quote.findMany({
    select: { id: true, zohoId: true, amount: true }
  });
  console.log(`Total Quotes:`, quotes.length);
  for (const q of quotes) {
    if (q.zohoId?.includes('4930630')) {
      console.log(`Quote match:`, q);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
