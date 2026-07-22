const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function debugCommissions() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== DIAGNOSING COMMISSIONS HUB CALCULATIONS & DATA ===")

  // Fetch 10 sample invoices with non-zero amounts
  const res = await client.query(`
    SELECT "zohoId", "amount", "status", "issueDate", "items" 
    FROM "Invoice" 
    WHERE "amount" > 0 AND "status" NOT IN ('Void', 'Draft') 
    LIMIT 10;
  `)

  console.log(`Analyzing ${res.rows.length} sample invoices:\n`)

  res.rows.forEach((inv, i) => {
    const items = inv.items || {}
    const cfs = items.custom_fields || []

    const subTotal = parseFloat(items.sub_total || items.subTotal) || inv.amount || 0
    const deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || 0)
    const vigRate = parseFloat(items.vigRate || 1.3)
    const deadCostPlusVig = parseFloat(items.deadCostPlusVig || items.dead_cost_plus_vig || 0) || (deadCost * vigRate)

    const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find(c => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0)
    const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find(c => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0)

    const storedProfit = items.profit
    const calcDeadProfit = subTotal - deadCost - additionalCosts - ccFees
    const calcAfterVigProfit = subTotal - deadCostPlusVig - additionalCosts - ccFees

    const storedComm = items.commission || items.cf_commission_amount_unformatted
    const calcComm = calcAfterVigProfit * 0.50

    console.log(`📄 #${i+1} ZohoID: ${inv.zohoId} | Status: ${inv.status}`)
    console.log(`   - Subtotal: $${subTotal}`)
    console.log(`   - Dead Cost (No VIG): $${deadCost}`)
    console.log(`   - Dead Cost Plus VIG (${vigRate}x): $${deadCostPlusVig}`)
    console.log(`   - Additional Costs: $${additionalCosts} | CC Fees: $${ccFees}`)
    console.log(`   - Stored Profit in DB: ${storedProfit !== undefined ? '$' + storedProfit : 'NONE'}`)
    console.log(`   - Calculated Dead Profit (Sales Goal): $${calcDeadProfit}`)
    console.log(`   - Calculated After-VIG Profit (Net Profit): $${calcAfterVigProfit}`)
    console.log(`   - Stored Commission in DB: ${storedComm !== undefined ? '$' + storedComm : 'NONE'}`)
    console.log(`   - Calculated 50% Commission: $${calcComm}`)
    console.log(`   - Salesperson on Invoice: "${items.salesperson || 'NONE'}"\n`)
  })

  await client.end()
}

debugCommissions().catch(console.error)
