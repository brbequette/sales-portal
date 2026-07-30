import { PrismaClient } from "@prisma/client";

async function testConn(url: string, label: string) {
  console.log(`\n--- Testing ${label} ---`);
  const client = new PrismaClient({
    datasources: { db: { url } }
  });
  try {
    const count = await client.account.count();
    console.log(`SUCCESS for ${label}! Count = ${count}`);
  } catch (err: any) {
    console.error(`FAILED for ${label}:`, err.message);
  } finally {
    await client.$disconnect();
  }
}

async function main() {
  const url1 = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez-pooler.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require";
  const url2 = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require";
  const url3 = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez-pooler.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require&connect_timeout=30";

  await testConn(url1, "Pooler");
  await testConn(url2, "Direct Host");
  await testConn(url3, "Direct Host with timeout");
}

main().catch(console.error);
