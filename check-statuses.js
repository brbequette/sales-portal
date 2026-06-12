const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function check() {
  const statuses = await prisma.invoice.groupBy({ by: ['status'], _count: true });
  console.log(statuses);
}
check();
