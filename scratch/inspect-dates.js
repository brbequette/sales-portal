const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const firstInvoice = await prisma.invoice.findFirst({
      orderBy: { issueDate: 'asc' },
      select: { issueDate: true }
    });
    const lastInvoice = await prisma.invoice.findFirst({
      orderBy: { issueDate: 'desc' },
      select: { issueDate: true }
    });
    const invoiceCount = await prisma.invoice.count();

    const firstDeal = await prisma.deal.findFirst({
      orderBy: { closingDate: 'asc' },
      select: { closingDate: true }
    });
    const lastDeal = await prisma.deal.findFirst({
      orderBy: { closingDate: 'desc' },
      select: { closingDate: true }
    });
    const dealCount = await prisma.deal.count();

    console.log({
      invoiceCount,
      firstInvoice: firstInvoice?.issueDate,
      lastInvoice: lastInvoice?.issueDate,
      dealCount,
      firstDeal: firstDeal?.closingDate,
      lastDeal: lastDeal?.closingDate
    });
  } catch (error) {
    console.error('Error:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
