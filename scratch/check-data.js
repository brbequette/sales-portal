const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.count();
  const accounts = await prisma.account.count();
  const contacts = await prisma.contact.count();
  const invoices = await prisma.invoice.count();
  const deals = await prisma.deal.count();
  const salesOrders = await prisma.salesOrder.count();
  const quotes = await prisma.quote.count();

  console.log("=== DB Count ===");
  console.log("Users:", users);
  console.log("Accounts:", accounts);
  console.log("Contacts:", contacts);
  console.log("Invoices:", invoices);
  console.log("Deals:", deals);
  console.log("Sales Orders:", salesOrders);
  console.log("Quotes:", quotes);

  if (invoices > 0) {
    const sample = await prisma.invoice.findFirst();
    console.log("\nSample Invoice:", JSON.stringify(sample, null, 2));
  } else {
    console.log("\nNo Invoices found in DB.");
  }

  if (accounts > 0) {
    const sampleAcc = await prisma.account.findFirst();
    console.log("\nSample Account:", JSON.stringify(sampleAcc, null, 2));
  }

  await prisma.$disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
