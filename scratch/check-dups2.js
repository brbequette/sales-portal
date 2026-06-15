const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const invDups = await p.$queryRaw`
    SELECT 
      COALESCE(items->>'invoiceNumber', items->>'invoice_number') AS inv_num,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Invoice"
    WHERE COALESCE(items->>'invoiceNumber', items->>'invoice_number') IS NOT NULL
    GROUP BY COALESCE(items->>'invoiceNumber', items->>'invoice_number')
    HAVING COUNT(*) > 1
  `
  console.log('Invoice duplicates count:', invDups.length)
  if (invDups.length > 0) {
    console.log('First 2 groups:', JSON.stringify(invDups.slice(0, 2), null, 2))
    
    // Look at the details of the first duplicate pair
    const ids = invDups[0].ids
    const records = await p.invoice.findMany({ where: { id: { in: ids } } })
    console.log('Details for first duplicate group:')
    for (const r of records) {
      console.log(`id: ${r.id}, zohoId: ${r.zohoId}, amount: ${r.amount}, status: ${r.status}, createdAt: ${r.createdAt}, issueDate: ${r.issueDate}`)
    }
  }
}

main().catch(console.error).finally(() => p.$disconnect())
