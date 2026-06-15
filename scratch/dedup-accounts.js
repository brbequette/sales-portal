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
  `

  console.log('Total duplicate account groups:', accDups.length)

  let deletedCount = 0

  for (const group of accDups) {
    // We want to keep the account that has the most relations, or simply the oldest.
    // Let's just pick the oldest one (first in the order by createdAt ASC).
    const keepId = group.ids[0]
    const deleteIds = group.ids.slice(1)

    // Reparent all associated records
    await p.contact.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })
    await p.deal.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })
    await p.invoice.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })
    await p.note.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })
    await p.quote.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })
    await p.salesOrder.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })
    await p.task.updateMany({ where: { accountId: { in: deleteIds } }, data: { accountId: keepId } })

    // Now delete the accounts
    const res = await p.account.deleteMany({ where: { id: { in: deleteIds } } })
    deletedCount += res.count
  }

  console.log('Successfully deleted account duplicates:', deletedCount)
}

main().catch(console.error).finally(() => p.$disconnect())
