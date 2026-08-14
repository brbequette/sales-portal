const { PrismaClient } = require("@prisma/client");
const p = new PrismaClient();
async function main() {
  const pkgs = await p.$queryRawUnsafe(
    `SELECT id, "packageNumber", status, "trackingNumber", carrier, "updatedAt" FROM "Package" WHERE status='shipped' AND "updatedAt" > '2026-08-14'::timestamp ORDER BY "updatedAt" DESC`
  );
  console.log(JSON.stringify(pkgs, null, 2));
  await p.$disconnect();
}
main().catch(e => { console.error(e); process.exit(1); });
