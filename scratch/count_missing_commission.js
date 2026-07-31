const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const allMissingCount = await prisma.invoice.count({
    where: {
      status: { notIn: ['void', 'Void', 'VOID', 'draft', 'Draft', 'DRAFT'] },
      OR: [
        { items: { equals: null } },
        { items: { path: ['deadCostTotal'], equals: null } },
        { items: { path: ['deadCostTotal'], equals: 0 } },
        { items: { path: ['profit'], equals: null } },
        { items: { path: ['commission'], equals: null } }
      ]
    }
  })
  console.log(`Number of non-void/non-draft invoices missing commission or cost data: ${allMissingCount}`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
}).finally(async () => {
  await prisma.$disconnect()
})
