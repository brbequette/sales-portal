const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const users = await prisma.user.findMany();
  console.log("=== Statistics per Sales Representative ===");
  
  for (const user of users) {
    const accCount = await prisma.account.count({
      where: { ownerId: user.id }
    });
    
    // Get accounts owned by this user
    const userAccounts = await prisma.account.findMany({
      where: { ownerId: user.id },
      select: { id: true }
    });
    const accIds = userAccounts.map(a => a.id);
    
    const invCount = await prisma.invoice.count({
      where: { accountId: { in: accIds } }
    });
    
    const overdueCount = await prisma.invoice.count({
      where: { 
        accountId: { in: accIds },
        status: "Overdue"
      }
    });

    const totalLtv = await prisma.invoice.aggregate({
      where: { accountId: { in: accIds } },
      _sum: { amount: true }
    });

    console.log(`\nUser: ${user.name} (${user.email})`);
    console.log(`- Role: ${user.role}`);
    console.log(`- Accounts owned: ${accCount}`);
    console.log(`- Invoices linked: ${invCount}`);
    console.log(`- Overdue Invoices: ${overdueCount}`);
    console.log(`- Total LTV: $${(totalLtv._sum.amount || 0).toLocaleString()}`);
  }

  await prisma.$disconnect();
}

main();
