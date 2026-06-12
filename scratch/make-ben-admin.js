const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.updateMany({
    where: { email: 'ben@titandiamond.net' },
    data: { role: 'Administrator' }
  });
  
  console.log("Updated role for ben");
}

main().catch(console.error).finally(() => prisma.$disconnect());
