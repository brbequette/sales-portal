import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const invoices = await prisma.invoice.findMany({
    select: {
      items: true
    }
  })

  const counts: Record<string, number> = {}
  for (const inv of invoices) {
    const items = (inv.items as any) || {}
    const sp = items.salesperson || "Null/Empty"
    counts[sp] = (counts[sp] || 0) + 1
  }

  console.log("Invoice salesperson counts in DB:", counts)
}

main().catch(console.error)
