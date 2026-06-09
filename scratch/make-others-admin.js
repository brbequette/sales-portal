const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  await prisma.user.updateMany({
    where: { 
      email: { in: ['monty@titandiamond.net', 'richard@titandiamond.net'] } 
    },
    data: { role: 'Administrator' }
  });
  console.log("Updated Monty and Richard to Administrator");
}

main().catch(console.error).finally(() => prisma.$disconnect());
