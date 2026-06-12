const { PrismaClient } = require("@prisma/client");
const prisma = new PrismaClient();

async function main() {
  const invoices = await prisma.invoice.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log("RECENT INVOICES:", JSON.stringify(invoices, null, 2));

  const quotes = await prisma.quote.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log("RECENT QUOTES:", JSON.stringify(quotes, null, 2));

  const so = await prisma.salesOrder.findMany({
    take: 5,
    orderBy: { createdAt: 'desc' }
  });
  console.log("RECENT SALES ORDERS:", JSON.stringify(so, null, 2));
}

main().finally(() => prisma.$disconnect());
