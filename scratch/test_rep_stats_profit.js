const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testJan2026Profit() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== CHECKING ROSS HAISLER JAN 2026 INVOICES & COSTS ===")

  const res = await client.query(`
    SELECT "id", "issueDate", "amount", "items"
    FROM "Invoice"
    WHERE "issueDate" >= '2026-01-01' AND "issueDate" <= '2026-01-31'
  `)

  console.log(`Found ${res.rows.length} invoices in Jan 2026:`)

  let totalSubtotal = 0
  let totalDeadCost = 0
  let totalDeadProfit = 0

  for (const inv of res.rows) {
    const items = inv.items || {}
    const salesperson = items.salesperson || ""
    if (!salesperson.toLowerCase().includes("ross")) continue

    const subtotal = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount) || 0
    const deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || 0)
    const deadProfit = subtotal - deadCost

    totalSubtotal += subtotal
    totalDeadCost += deadCost
    totalDeadProfit += deadProfit

    console.log(`- Inv #${items.invoiceNumber || inv.id}: Subtotal=$${subtotal.toFixed(2)} | DeadCost=$${deadCost.toFixed(2)} | DeadProfit=$${deadProfit.toFixed(2)}`)
  }

  console.log("\nSummary for Ross Haisler (Jan 2026):")
  console.log(`Total Subtotal: $${totalSubtotal.toFixed(2)}`)
  console.log(`Total Dead Cost: $${totalDeadCost.toFixed(2)}`)
  console.log(`Total Dead Profit: $${totalDeadProfit.toFixed(2)}`)

  await client.end()
}

testJan2026Profit().catch(console.error)
