const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkFinancialFields() {
  console.log("=== CHECKING FINANCIAL & COMMISSION FIELDS ON INVOICES ===")

  const invoices = await prisma.invoice.findMany({
    select: { id: true, zohoId: true, items: true }
  })

  let withDeadCost = 0
  let withProfit = 0
  let withCommission = 0
  let withVig = 0
  let total = invoices.length

  for (const inv of invoices) {
    const items = (inv.items || {})
    const cfs = items.custom_fields || []

    const deadCost = items.deadCostTotal || items.dead_cost_total || cfs.find(c => c.label?.toUpperCase().includes('DEAD COST TOTAL'))?.value
    const profit = items.profit || cfs.find(c => c.label?.toUpperCase() === 'PROFIT' || c.label?.toUpperCase() === 'RECALCULATED PROFIT')?.value
    const comm = items.salesCommission || items.commission || cfs.find(c => c.label?.toUpperCase().includes('SALES COMMISSION'))?.value
    const vig = items.vigRate || items.vig_rate || cfs.find(c => c.label?.toUpperCase().includes('VIG'))?.value

    if (deadCost != null) withDeadCost++
    if (profit != null) withProfit++
    if (comm != null) withCommission++
    if (vig != null) withVig++
  }

  console.log(`• Total Invoices in Database: ${total.toLocaleString()}`)
  console.log(`• Invoices with Dead Costs filled: ${withDeadCost.toLocaleString()} (${((withDeadCost/total)*100).toFixed(1)}%)`)
  console.log(`• Invoices with Profit filled: ${withProfit.toLocaleString()} (${((withProfit/total)*100).toFixed(1)}%)`)
  console.log(`• Invoices with Commission filled: ${withCommission.toLocaleString()} (${((withCommission/total)*100).toFixed(1)}%)`)
  console.log(`• Invoices with VIG Rate filled: ${withVig.toLocaleString()} (${((withVig/total)*100).toFixed(1)}%)`)

  // Check Products item cost
  const products = await prisma.product.findMany({ select: { description: true } })
  let productsWithCost = 0
  for (const p of products) {
    try {
      const parsed = JSON.parse(p.description || '{}')
      if (parsed.cost !== undefined && parsed.cost !== null) productsWithCost++
    } catch(e) {}
  }
  console.log(`\n• Total Products in Catalog: ${products.length.toLocaleString()}`)
  console.log(`• Products with Item Costs filled: ${productsWithCost.toLocaleString()} (${((productsWithCost/products.length)*100).toFixed(1)}%)`)
}

checkFinancialFields()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
