const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testCommissionsCalculation() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== TESTING EXACT COMMISSIONS OUTPUT FOR ROSS HAISLER ===")

  const usersRes = await client.query(`SELECT "id", "name", "email" FROM "User";`)
  const users = usersRes.rows
  const userByName = new Map(users.map(u => [u.name?.toLowerCase().trim(), u]))
  const rossUser = userByName.get("ross haisler")

  console.log("Ross User ID:", rossUser?.id)

  const invRes = await client.query(`
    SELECT "id", "zohoId", "issueDate", "status", "amount", "items"
    FROM "Invoice"
    WHERE LOWER("items"::text) LIKE '%ross%';
  `)

  console.log(`Invoices matching Ross: ${invRes.rows.length}`)

  let totalProfit = 0
  let totalUpfront = 0
  let totalFinal = 0
  let totalEarned = 0
  let invoiceCount = 0

  for (const inv of invRes.rows) {
    const items = inv.items || {}
    const salespersonName = items.salesperson || ""
    if (!salespersonName.toLowerCase().includes("ross")) continue

    invoiceCount++

    const subTotal = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount) || 0
    const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    let deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || 0)
    if (deadCost === 0 && lineItems.length > 0) {
      deadCost = lineItems.reduce((sum, li) => {
        const qty = parseFloat(li.quantity) || 1
        const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
        return sum + (qty * cost)
      }, 0)
    }

    const docDate = inv.issueDate ? new Date(inv.issueDate) : new Date()
    const year = docDate.getFullYear()
    const vigRate = year <= 2024 ? 1.3 : parseFloat(items.vigRate || 1.3)
    const deadCostPlusVig = deadCost * vigRate

    const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || 0)
    const ccFees = parseFloat(items.ccFees || items.cc_fees || 0)

    const profit = subTotal - deadCostPlusVig - additionalCosts - ccFees

    const isPaid = ['paid', 'overdue', 'partially_paid', 'sent'].includes((inv.status || '').toLowerCase())

    const upfront = Math.max(0, profit * 0.25)
    const final = isPaid ? Math.max(0, (profit * 0.50) - upfront) : 0
    const totalCommission = upfront + final

    totalProfit += profit
    totalUpfront += upfront
    totalFinal += final
    totalEarned += totalCommission
  }

  console.log(`\nResults for Ross Haisler (${invoiceCount} invoices):`)
  console.log(`- Total After-VIG Profit: $${totalProfit.toFixed(2)}`)
  console.log(`- Total Upfront (25%): $${totalUpfront.toFixed(2)}`)
  console.log(`- Total Final Payout (25%): $${totalFinal.toFixed(2)}`)
  console.log(`- Total Earned Commission (50%): $${totalEarned.toFixed(2)}`)

  await client.end()
}

testCommissionsCalculation().catch(console.error)
