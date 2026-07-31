import { PrismaClient } from "@prisma/client";
import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.join(__dirname, '../.env') });

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
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error("DATABASE_URL is not set in environment.");
    process.exit(1);
  }
  await testConn(url, "Environment DB URL");
}

main().catch(console.error);
