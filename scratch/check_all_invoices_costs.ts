import { PrismaClient } from '@prisma/client'

async function main() {
  const prisma = new PrismaClient()
  try {
    const invoices = await prisma.invoice.findMany({
      where: {
        status: { notIn: ["Void", "Draft"] }
      }
    })
    
    let withCostCount = 0
    let withoutCostCount = 0
    
    invoices.forEach(inv => {
      const items = inv.items as any || {}
      const salesperson = items.salesperson || ""
      const hasCost = items.deadCostTotal !== undefined
      
      if (hasCost) {
        withCostCount++
      } else {
        withoutCostCount++
      }
      
      if (hasCost && withCostCount < 5) {
        console.log(`Has Cost - ID: ${inv.id}, Num: ${items.invoiceNumber}, Salesperson: ${salesperson}, Subtotal: ${items.sub_total}, deadCostTotal: ${items.deadCostTotal}`)
      }
    })
    
    console.log(`Processed: ${invoices.length} invoices. With Cost: ${withCostCount}, Without Cost: ${withoutCostCount}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)
