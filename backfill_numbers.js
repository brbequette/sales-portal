const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const quotes = await prisma.quote.findMany()
  for (const q of quotes) {
    if (Array.isArray(q.items)) {
      console.log(`Fixing Quote ${q.id}`)
      const num = q.zohoId ? `EST-${q.zohoId.slice(-5)}` : `EST-${q.id.slice(-5)}`
      await prisma.quote.update({
        where: { id: q.id },
        data: { items: { lineItems: q.items, estimateNumber: num } }
      })
    }
  }

  const sos = await prisma.salesOrder.findMany()
  for (const so of sos) {
    if (Array.isArray(so.items)) {
      console.log(`Fixing SO ${so.id}`)
      const num = so.zohoId ? `SO-${so.zohoId.slice(-5)}` : `SO-${so.id.slice(-5)}`
      await prisma.salesOrder.update({
        where: { id: so.id },
        data: { items: { lineItems: so.items, salesOrderNumber: num } }
      })
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
