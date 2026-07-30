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
  const poolerUrl = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez-pooler.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require";
  const directUrl = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require";

  await testConn(poolerUrl, "Pooler URL");
  await testConn(directUrl, "Direct URL");
}

main();
