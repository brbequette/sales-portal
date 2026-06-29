const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
async function run() {
  const a = await prisma.account.findFirst();
  console.log(a ? Object.keys(a) : 'no accounts');
  console.log(a ? a.rawData : 'no raw data');
}
run().catch(console.error).finally(() => prisma.$disconnect());
