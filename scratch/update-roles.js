const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.updateMany({
    where: { email: 'richard@titandiamond.net' },
    data: { role: 'Sales Representative' }
  });
  
  await prisma.user.updateMany({
    where: { name: 'BOBBY SALYERS' },
    data: { role: 'Collections' }
  });
  
  console.log("Updated roles for Richard and Bobby");
}

main().catch(console.error).finally(() => prisma.$disconnect());
