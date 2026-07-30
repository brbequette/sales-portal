import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

async function main() {
  const invoices = await prisma.invoice.findMany({
    select: {
      issueDate: true,
      items: true,
      amount: true,
      zohoId: true
    }
  })

  let count = 0
  for (const inv of invoices) {
    const items = (inv.items as any) || {}
    const sp = items.salesperson || ""
    if (sp.toUpperCase().includes("ROSS HAISLER")) {
      const d = inv.issueDate ? new Date(inv.issueDate) : null
      if (d && d.getFullYear() === 2026 && d.getMonth() === 6) { // July 2026
        count++
        console.log(`Invoice: ${items.invoiceNumber}, Date: ${inv.issueDate.toISOString().split("T")[0]}`)
        console.log(`  Amount: ${inv.amount}`)
        console.log(`  sub_total: ${items.sub_total}`)
        console.log(`  deadCostTotal: ${items.deadCostTotal}`)
        console.log(`  profit: ${items.profit}`)
      }
    }
  }
  console.log(`Total July 2026 invoices for Ross: ${count}`)
}

main().catch(console.error)
