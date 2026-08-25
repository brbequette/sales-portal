const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
  await prisma.$transaction(async (tx) => {
    await tx.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ProductWebVisibilityBackup_20260825" (
        "id" TEXT PRIMARY KEY,
        "giftItem" BOOLEAN NOT NULL
      )
    `)
    await tx.$executeRawUnsafe(`
      INSERT INTO "ProductWebVisibilityBackup_20260825" ("id", "giftItem")
      SELECT "id", "giftItem" FROM "Product"
      ON CONFLICT ("id") DO NOTHING
    `)
    await tx.$executeRawUnsafe(`
      ALTER TABLE "Product"
      ADD COLUMN IF NOT EXISTS "showOnWeb" BOOLEAN NOT NULL DEFAULT true
    `)
    await tx.$executeRawUnsafe(`
      UPDATE "Product" SET "showOnWeb" = false WHERE "giftItem" = true
    `)
  })

  const [result] = await prisma.$queryRawUnsafe(`
    SELECT
      COUNT(*) FILTER (WHERE "giftItem" = true AND "showOnWeb" = true) AS visible_gifts,
      (SELECT COUNT(*) FROM "ProductWebVisibilityBackup_20260825") AS backup_rows
    FROM "Product"
  `)

  if (result.visible_gifts !== 0n || result.backup_rows === 0n) {
    throw new Error(`Visibility migration verification failed: visible gifts=${result.visible_gifts}, backup rows=${result.backup_rows}`)
  }

  console.log(`Product visibility migration verified; rollback rows: ${result.backup_rows}`)
}

main()
  .finally(() => prisma.$disconnect())
  .catch((error) => {
    console.error(error)
    process.exit(1)
  })
