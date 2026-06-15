const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  console.log("Checking Account duplicates by name...")
  const accDups = await p.$queryRaw`
    SELECT 
      LOWER(name) as lower_name,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Account"
    GROUP BY LOWER(name)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  console.log(JSON.stringify(accDups, null, 2))

  console.log("Checking Deal duplicates by name + accountId...")
  const dealDups = await p.$queryRaw`
    SELECT 
      "accountId",
      LOWER(name) as lower_name,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Deal"
    GROUP BY "accountId", LOWER(name)
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  console.log(JSON.stringify(dealDups, null, 2))

  console.log("Checking Product duplicates by SKU...")
  const prodDups = await p.$queryRaw`
    SELECT 
      sku,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Product"
    GROUP BY sku
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  console.log(JSON.stringify(prodDups, null, 2))

}

main().catch(console.error).finally(() => p.$disconnect())
