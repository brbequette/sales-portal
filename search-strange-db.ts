import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();

async function main() {
  const target = 'cms85fww10001fd2/g414yve6';
  console.log(`Searching database for: ${target}`);

  // Check Account
  const acc = await prisma.account.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { name: { contains: target } }
      ]
    }
  });
  if (acc) console.log("Found in Account:", acc);

  // Check User
  const usr = await prisma.user.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { name: { contains: target } }
      ]
    }
  });
  if (usr) console.log("Found in User:", usr);

  // Check Contact
  const con = await prisma.contact.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { firstName: { contains: target } }
      ]
    }
  });
  if (con) console.log("Found in Contact:", con);

  // Check Deal
  const deal = await prisma.deal.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { name: { contains: target } }
      ]
    }
  });
  if (deal) console.log("Found in Deal:", deal);

  // Check Invoice
  const inv = await prisma.invoice.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { status: { contains: target } }
      ]
    }
  });
  if (inv) console.log("Found in Invoice:", inv);

  // Check SalesOrder
  const so = await prisma.salesOrder.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { status: { contains: target } }
      ]
    }
  });
  if (so) console.log("Found in SalesOrder:", so);

  // Check Quote
  const q = await prisma.quote.findFirst({
    where: {
      OR: [
        { id: target },
        { zohoId: target },
        { status: { contains: target } }
      ]
    }
  });
  if (q) console.log("Found in Quote:", q);

  // Check LineItem
  const li = await prisma.lineItem.findFirst({
    where: {
      OR: [
        { id: target },
        { sku: { contains: target } }
      ]
    }
  });
  if (li) console.log("Found in LineItem:", li);

  // General raw search on Invoice raw fields
  const allInvoices = await prisma.invoice.findMany();
  for (const doc of allInvoices) {
    const rawStr = JSON.stringify(doc);
    if (rawStr.includes(target)) {
      console.log(`Found string in raw invoice ID=${doc.id}:`, doc.items);
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect());
