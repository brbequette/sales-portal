const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  try {
    const total = await prisma.quote.count()
    console.log(`Total Quotes: ${total}`)

    const statuses = await prisma.quote.groupBy({
      by: ['status'],
      _count: { id: true }
    })
    console.log("\nQuotes by status:")
    for (const s of statuses) {
      console.log(`  ${s.status}: ${s._count.id}`)
    }

    const hasZohoId = await prisma.quote.count({
      where: { zohoId: { not: '' } }
    })
    console.log(`\nQuotes with Zoho ID: ${hasZohoId}`)

    // Count quotes where items->line_items is missing or empty array
    const sql = `
      SELECT COUNT(*)::int as count FROM "Quote"
      WHERE (items->'line_items' IS NULL OR items->'line_items' = '[]'::jsonb)
    `
    const rows = await prisma.$queryRawUnsafe(sql)
    console.log(`Uncached Quotes (missing line_items): ${rows[0]?.count}`)

    // Count quotes with status 'Invoiced' and missing line items
    const sqlInvoiced = `
      SELECT COUNT(*)::int as count FROM "Quote"
      WHERE status = 'Invoiced' AND (items->'line_items' IS NULL OR items->'line_items' = '[]'::jsonb)
    `
    const rowsInvoiced = await prisma.$queryRawUnsafe(sqlInvoiced)
    console.log(`Uncached Quotes with status 'Invoiced': ${rowsInvoiced[0]?.count}`)

  } catch (error) {
    console.error("Error:", error)
  } finally {
    await prisma.$disconnect()
  }
}

main()
