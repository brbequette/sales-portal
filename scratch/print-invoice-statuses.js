const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const statuses = await prisma.invoice.groupBy({
    by: ['status'],
    _count: {
      id: true
    }
  });
  console.log("=== Distinct Invoice Statuses and Counts ===");
  console.log(JSON.stringify(statuses, null, 2));

  // Let's also check if there are unpaid invoices past their due dates
  const now = new Date();
  const pastDueUnpaid = await prisma.invoice.count({
    where: {
      dueDate: { lt: now },
      status: { notIn: ['Paid', 'paid'] }
    }
  });
  console.log("\nInvoices past due date and not marked 'Paid':", pastDueUnpaid);

  if (pastDueUnpaid > 0) {
    const samplePastDue = await prisma.invoice.findFirst({
      where: {
        dueDate: { lt: now },
        status: { notIn: ['Paid', 'paid'] }
      },
      include: {
        account: true
      }
    });
    console.log("Sample Past Due Invoice:", JSON.stringify(samplePastDue, null, 2));
  }

  await prisma.$disconnect();
}

main();
