const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  console.log("Checking Contact duplicates by email within the same account...")
  const emailDups = await p.$queryRaw`
    SELECT 
      "accountId",
      LOWER(email) as lower_email,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Contact"
    WHERE email IS NOT NULL AND email != ''
    GROUP BY "accountId", LOWER(email)
    HAVING COUNT(*) > 1
  `

  console.log('Total duplicate email groups:', emailDups.length)

  let deletedCountEmail = 0

  for (const group of emailDups) {
    const keepId = group.ids[0]
    const deleteIds = group.ids.slice(1)
    
    const res = await p.contact.deleteMany({ where: { id: { in: deleteIds } } })
    deletedCountEmail += res.count
  }

  console.log('Successfully deleted email duplicates:', deletedCountEmail)

  console.log("Checking Contact duplicates by phone within the same account...")
  const phoneDups = await p.$queryRaw`
    SELECT 
      "accountId",
      phone,
      COUNT(*)::text AS cnt,
      array_agg(id ORDER BY "createdAt" ASC) AS ids
    FROM "Contact"
    WHERE phone IS NOT NULL AND phone != ''
    GROUP BY "accountId", phone
    HAVING COUNT(*) > 1
  `

  console.log('Total duplicate phone groups:', phoneDups.length)

  let deletedCountPhone = 0

  for (const group of phoneDups) {
    // some might have already been deleted by email dedup, but deleteMany handles non-existent gracefully
    const keepId = group.ids[0]
    const deleteIds = group.ids.slice(1)
    
    const res = await p.contact.deleteMany({ where: { id: { in: deleteIds } } })
    deletedCountPhone += res.count
  }

  console.log('Successfully deleted phone duplicates:', deletedCountPhone)
}

main().catch(console.error).finally(() => p.$disconnect())
