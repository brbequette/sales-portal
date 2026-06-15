const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
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
  `

  console.log('Total duplicate deal groups:', dealDups.length)

  let deletedCount = 0

  for (const group of dealDups) {
    const keepId = group.ids[0]
    const deleteIds = group.ids.slice(1)

    // Re-parent Tasks
    await p.task.updateMany({
      where: { dealId: { in: deleteIds } },
      data: { dealId: keepId }
    })

    // Delete Deals
    const res = await p.deal.deleteMany({ where: { id: { in: deleteIds } } })
    deletedCount += res.count
  }

  console.log('Successfully deleted deal duplicates:', deletedCount)
}

main().catch(console.error).finally(() => p.$disconnect())
