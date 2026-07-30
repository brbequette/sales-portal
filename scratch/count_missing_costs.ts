import { PrismaClient, Prisma } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const missingCount = await prisma.invoice.count({
    where: {
      status: { notIn: ['void', 'Void', 'VOID', 'draft', 'Draft', 'DRAFT'] },
      OR: [
        { items: { equals: Prisma.DbNull } },
        { items: { path: ['deadCostTotal'], equals: Prisma.DbNull } },
        { items: { path: ['deadCostTotal'], equals: 0 } },
        { items: { path: ['profit'], equals: Prisma.DbNull } },
        { items: { path: ['commission'], equals: Prisma.DbNull } }
      ]
    }
  })
  console.log(`Number of invoices missing cost/commission data in local database: ${missingCount}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
