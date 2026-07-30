import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const invoices = await prisma.invoice.findMany({
    select: {
      issueDate: true,
      items: true
    }
  })

  const counts: Record<string, number> = {}
  for (const inv of invoices) {
    const items = (inv.items as any) || {}
    const sp = items.salesperson || ""
    if (sp.toUpperCase().includes("ROSS HAISLER")) {
      const d = inv.issueDate ? new Date(inv.issueDate) : null
      if (d) {
        const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`
        counts[key] = (counts[key] || 0) + 1
      }
    }
  }

  console.log("Ross Haisler invoice counts by Month in DB:", counts)
}

main().catch(console.error)
