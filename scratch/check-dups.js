const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  console.log("Checking Invoice duplicates...")
  const invDups = await p.$queryRaw`
    SELECT 
      COALESCE(items->>'invoiceNumber', items->>'invoice_number') AS inv_num,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Invoice"
    WHERE COALESCE(items->>'invoiceNumber', items->>'invoice_number') IS NOT NULL
    GROUP BY COALESCE(items->>'invoiceNumber', items->>'invoice_number')
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  console.log(JSON.stringify(invDups, null, 2))

  console.log("Checking SalesOrder duplicates...")
  const soDups = await p.$queryRaw`
    SELECT 
      COALESCE(items->>'salesorder_number', items->>'salesorderNumber') AS so_num,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "SalesOrder"
    WHERE COALESCE(items->>'salesorder_number', items->>'salesorderNumber') IS NOT NULL
    GROUP BY COALESCE(items->>'salesorder_number', items->>'salesorderNumber')
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  console.log(JSON.stringify(soDups, null, 2))

  console.log("Checking Quote (Estimate) duplicates...")
  const quoteDups = await p.$queryRaw`
    SELECT 
      COALESCE(items->>'estimate_number', items->>'quote_number') AS q_num,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Quote"
    WHERE COALESCE(items->>'estimate_number', items->>'quote_number') IS NOT NULL
    GROUP BY COALESCE(items->>'estimate_number', items->>'quote_number')
    HAVING COUNT(*) > 1
    ORDER BY COUNT(*) DESC
    LIMIT 5
  `
  console.log(JSON.stringify(quoteDups, null, 2))
}

main().catch(console.error).finally(() => p.$disconnect())
