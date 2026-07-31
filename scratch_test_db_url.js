const { PrismaClient } = require('@prisma/client');

async function testConn(url, label) {
  console.log(`Testing ${label}...`);
  const prisma = new PrismaClient({
    datasources: { db: { url } }
  });
  try {
    const count = await prisma.account.count();
    console.log(`SUCCESS [${label}]: ${count} accounts found`);
  } catch (err) {
    console.log(`FAILED [${label}]: ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }
}

async function main() {
  const poolerUrl = process.env.DATABASE_URL;
  const directUrl = process.env.DATABASE_URL;

  await testConn(poolerUrl, "Pooler URL");
  await testConn(directUrl, "Direct URL");
}

main();
