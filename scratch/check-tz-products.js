const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  // Check invoice duplicates
  const invDups = await p.$queryRaw`
    SELECT "zohoId", count(*)::text as cnt
    FROM "Invoice"
    GROUP BY "zohoId"
    HAVING count(*) > 1
  `;
  console.log('Invoice duplicates by zohoId:', invDups.length);

  // Check contact duplicates by zohoId
  const contactDups = await p.$queryRaw`
    SELECT "zohoId", count(*)::text as cnt
    FROM "Contact"
    GROUP BY "zohoId"
    HAVING count(*) > 1
  `;
  console.log('Contact duplicates by zohoId:', contactDups.length);

  // Check timezone distribution
  const tzDist = await p.$queryRaw`
    SELECT "timeZone", count(*)::text as cnt
    FROM "Account"
    GROUP BY "timeZone"
    ORDER BY count(*) DESC
  `;
  console.log('\nTimezone distribution:');
  console.log(JSON.stringify(tzDist, null, 2));

  // Check product fields
  const products = await p.product.findMany({ take: 5 });
  console.log('\nSample products:');
  console.log(JSON.stringify(products, null, 2));

  // Total counts
  const totalAccounts = await p.account.count();
  const totalWithTz = await p.account.count({ where: { timeZone: { not: null } } });
  const totalNoTz = await p.account.count({ where: { OR: [{ timeZone: null }, { timeZone: '' }] } });
  console.log(`\nAccounts: ${totalAccounts} total, ${totalWithTz} with timezone, ${totalNoTz} without`);

  process.exit(0);
}

run();
