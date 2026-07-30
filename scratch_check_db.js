const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const count = await prisma.account.count();
  console.log('Total accounts in Prisma DB:', count);

  const sample = await prisma.account.findFirst({ select: { id: true, name: true, ownerId: true, quality: true, status: true, owner: true } });
  console.log('Sample account:', JSON.stringify(sample, null, 2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
