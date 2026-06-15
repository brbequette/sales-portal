const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  const dist = await p.$queryRaw`
    SELECT quality, count(*)::text as cnt
    FROM "Account"
    GROUP BY quality
    ORDER BY count(*) DESC
  `;
  console.log('Quality distribution:', JSON.stringify(dist, null, 2));

  // Check how many accounts have lastPurchaseAt
  const withPurchase = await p.account.count({ where: { lastPurchaseAt: { not: null } } });
  const total = await p.account.count();
  console.log(`\n${withPurchase} of ${total} accounts have lastPurchaseAt set`);

  // Sample recent purchases
  const recent = await p.account.findMany({
    where: { lastPurchaseAt: { not: null } },
    select: { name: true, lastPurchaseAt: true, quality: true },
    orderBy: { lastPurchaseAt: 'desc' },
    take: 5
  });
  console.log('\nMost recent purchases:');
  recent.forEach(r => console.log(`  ${r.name}: ${r.lastPurchaseAt?.toISOString()} (${r.quality})`));

  process.exit(0);
}
run();
