const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function run() {
  const inv = await prisma.invoice.findFirst();
  const so = await prisma.salesOrder.findFirst();
  const q = await prisma.quote.findFirst();
  const po = await prisma.purchaseOrder.findFirst();
  const p = await prisma.payment.findFirst();
  
  console.log("INVOICE:", JSON.stringify(inv?.items, null, 2).slice(0, 500) + '...');
  console.log("SALES ORDER:", JSON.stringify(so?.items, null, 2).slice(0, 500) + '...');
  console.log("QUOTE:", JSON.stringify(q?.items, null, 2).slice(0, 500) + '...');
  console.log("PURCHASE ORDER:", JSON.stringify(po?.items, null, 2).slice(0, 500) + '...');
  console.log("PAYMENT:", JSON.stringify(p, null, 2).slice(0, 500) + '...');
}
run().then(() => prisma.$disconnect());
