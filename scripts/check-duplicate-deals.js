const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  const deals = await prisma.deal.findMany({
    include: { account: true }
  });

  console.log(`Total Deals in DB: ${deals.length}`);

  // Group by "AccountId + Deal Name"
  const dealMap = new Map();
  let duplicatesFound = 0;

  for (const deal of deals) {
    const key = `${deal.accountId}::${deal.name.toLowerCase()}`;
    if (!dealMap.has(key)) {
      dealMap.set(key, []);
    }
    dealMap.get(key).push(deal);
  }

  for (const [key, group] of dealMap.entries()) {
    if (group.length > 1) {
      duplicatesFound++;
      console.log(`\nFound potential duplicate deals for Account: ${group[0].account.name}`);
      console.log(`Deal Name: ${group[0].name}`);
      for (const d of group) {
        console.log(`  - ID: ${d.zohoId} | Stage: ${d.stage} | Amount: $${d.amount} | Created: ${d.createdAt}`);
      }
    }
  }

  console.log(`\nTotal duplicate groups found (same name & account): ${duplicatesFound}`);
}

main()
  .catch(e => console.error(e))
  .finally(() => prisma.$disconnect());
