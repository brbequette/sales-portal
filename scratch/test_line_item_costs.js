const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"
const { calculateDocumentCosts } = require('../netlify/functions/lib/cost-calculations')

async function testLineItemCosts() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== CALCULATING REAL DEAD PROFIT WITH LINE ITEM COSTS ===")

  const res = await client.query(`
    SELECT "id", "issueDate", "amount", "items"
    FROM "Invoice"
    WHERE "issueDate" >= '2026-01-01' AND "issueDate" <= '2026-01-31'
  `)

  let totalSubtotal = 0
  let totalDeadCost = 0
  let totalDeadProfit = 0
  let totalAfterVigProfit = 0

  for (const inv of res.rows) {
    const items = inv.items || {}
    const salesperson = items.salesperson || ""
    if (!salesperson.toLowerCase().includes("ross")) continue

    const calc = await calculateDocumentCosts(items)

    totalSubtotal += calc.subTotal
    totalDeadCost += calc.deadCostTotal
    totalDeadProfit += calc.deadProfitActual
    totalAfterVigProfit += calc.profit
  }

  console.log("\nJan 2026 Calculated Totals for Ross Haisler:")
  console.log(`- Total Subtotal: $${totalSubtotal.toFixed(2)}`)
  console.log(`- Total Dead Cost: $${totalDeadCost.toFixed(2)}`)
  console.log(`- Real Dead Profit (Sales Goals): $${totalDeadProfit.toFixed(2)}`)
  console.log(`- After-VIG Net Profit (Commissions): $${totalAfterVigProfit.toFixed(2)}`)

  await client.end()
}

testLineItemCosts().catch(console.error)
