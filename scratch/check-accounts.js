const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const account = await prisma.account.findFirst();
  console.log("Account:", account);
}

main().catch(console.error).finally(() => prisma.$disconnect());
