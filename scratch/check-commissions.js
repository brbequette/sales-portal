const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  let totalDeleted = 0

  // ── Step 1: Deduplicate by email + accountId ──────────────────────────
  // Keep the oldest record (lowest createdAt), delete the rest.
  // If any duplicate was isPrimary, promote the keeper to isPrimary.
  console.log('Step 1: Deduplicating by email + accountId...')
  const emailDups = await p.$queryRaw`
    SELECT 
      "accountId",
      LOWER(email) AS norm_email,
      array_agg(id ORDER BY "createdAt" ASC) AS ids,
      bool_or("isPrimary") AS any_primary
    FROM "Contact"
    WHERE email IS NOT NULL AND email != ''
    GROUP BY "accountId", LOWER(email)
    HAVING COUNT(*) > 1
  `
  
  for (const group of emailDups) {
    const [keepId, ...deleteIds] = group.ids
    if (group.any_primary) {
      await p.contact.update({ where: { id: keepId }, data: { isPrimary: true } })
    }
    const result = await p.contact.deleteMany({ where: { id: { in: deleteIds } } })
    totalDeleted += result.count
  }
  console.log(`  Deleted ${totalDeleted} email duplicates`)

  // ── Step 2: Deduplicate by name + accountId (after email dedup) ────────
  console.log('Step 2: Deduplicating by name + accountId...')
  let nameDeleted = 0
  const nameDups = await p.$queryRaw`
    SELECT 
      "accountId",
      LOWER(TRIM(COALESCE("firstName",'') || ' ' || COALESCE("lastName",''))) AS norm_name,
      array_agg(id ORDER BY "createdAt" ASC) AS ids,
      bool_or("isPrimary") AS any_primary
    FROM "Contact"
    WHERE 
      TRIM(COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')) != ''
      AND TRIM(COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')) != ' '
    GROUP BY "accountId", LOWER(TRIM(COALESCE("firstName",'') || ' ' || COALESCE("lastName",'')))
    HAVING COUNT(*) > 1
  `

  for (const group of nameDups) {
    const [keepId, ...deleteIds] = group.ids
    if (group.any_primary) {
      await p.contact.update({ where: { id: keepId }, data: { isPrimary: true } })
    }
    const result = await p.contact.deleteMany({ where: { id: { in: deleteIds } } })
    nameDeleted += result.count
  }
  console.log(`  Deleted ${nameDeleted} name duplicates`)
  totalDeleted += nameDeleted

  // ── Final count ────────────────────────────────────────────────────────
  const remaining = await p.contact.count()
  console.log(`\nDone. Total deleted: ${totalDeleted}`)
  console.log(`Contacts remaining: ${remaining}`)
}

main().catch(console.error).finally(() => p.$disconnect())
