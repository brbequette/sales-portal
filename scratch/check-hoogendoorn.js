const dns = require('dns');
dns.setDefaultResultOrder('ipv4first');

const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.findFirst({
    where: { name: { contains: "HOOGENDOORN", mode: "insensitive" } },
    include: {
      owner: true,
      invoices: true
    }
  });
  
  if (account) {
    console.log("Account details:");
    console.log(`- ID: ${account.id}`);
    console.log(`- Zoho ID: ${account.zohoId}`);
    console.log(`- Name: ${account.name}`);
    console.log(`- Owner in DB: ${account.owner.name} (Email: ${account.owner.email}, Zoho ID: ${account.owner.zohoId})`);
    console.log(`- Invoices count: ${account.invoices.length}`);
    account.invoices.forEach(inv => {
      console.log(`  * Invoice #${(inv.items || {}).invoiceNumber || inv.zohoId} | Status: ${inv.status} | Amount: ${inv.amount} | Salesperson: ${(inv.items || {}).salesperson}`);
    });
  } else {
    console.log("Account HOOGENDOORN not found in DB.");
  }
  await prisma.$disconnect();
}
main();
