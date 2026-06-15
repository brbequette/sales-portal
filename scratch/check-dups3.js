const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const invDups = await p.$queryRaw`
    SELECT 
      COALESCE(items->>'invoiceNumber', items->>'invoice_number') AS inv_num,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids,
      array_agg(items->>'profit') AS profits
    FROM "Invoice"
    WHERE COALESCE(items->>'invoiceNumber', items->>'invoice_number') IS NOT NULL
    GROUP BY COALESCE(items->>'invoiceNumber', items->>'invoice_number')
    HAVING COUNT(*) > 1
  `

  console.log('Total duplicate invoice groups:', invDups.length)

  let deletedCount = 0

  for (const group of invDups) {
    // Find which ID to keep
    const records = await p.invoice.findMany({ where: { id: { in: group.ids } } })
    
    // Sort logic to pick the best record:
    // 1. Prefer records that have a positive profit (CRM records usually have this, Books might not)
    // 2. Prefer 'Paid' or 'Overdue' over 'Closed' or 'Draft'
    // 3. Prefer older createdAt (the original CRM record)
    records.sort((a, b) => {
      const aProfit = parseFloat((a.items || {}).profit || '0')
      const bProfit = parseFloat((b.items || {}).profit || '0')
      if (aProfit > 0 && bProfit === 0) return -1
      if (bProfit > 0 && aProfit === 0) return 1

      const aPaid = (a.status === 'Paid') ? 1 : 0
      const bPaid = (b.status === 'Paid') ? 1 : 0
      if (aPaid !== bPaid) return bPaid - aPaid

      return a.createdAt.getTime() - b.createdAt.getTime()
    })

    const keepId = records[0].id
    const deleteIds = group.ids.filter(id => id !== keepId)

    // Delete the duplicates
    const res = await p.invoice.deleteMany({ where: { id: { in: deleteIds } } })
    deletedCount += res.count
  }

  console.log('Successfully deleted invoice duplicates:', deletedCount)
}

main().catch(console.error).finally(() => p.$disconnect())
