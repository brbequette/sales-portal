const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  try {
    const userCount = await prisma.user.count();
    const accountCount = await prisma.account.count();
    const dealCount = await prisma.deal.count();
    const invoiceCount = await prisma.invoice.count();
    console.log({ userCount, accountCount, dealCount, invoiceCount });
    
    if (userCount > 0) {
      const users = await prisma.user.findMany({ take: 5 });
      console.log('Sample Users:', users);
    }
    if (accountCount > 0) {
      const accounts = await prisma.account.findMany({ take: 5 });
      console.log('Sample Accounts:', accounts);
    }
  } catch (error) {
    console.error('Error querying DB:', error);
  } finally {
    await prisma.$disconnect();
  }
}

main();
