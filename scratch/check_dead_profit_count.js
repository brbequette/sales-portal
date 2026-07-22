const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function checkDeadProfitCount() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== CHECKING DEAD PROFIT ACROSS ALL INVOICES IN POSTGRESQL ===")

  // 1. Total Invoices
  const totalRes = await client.query('SELECT COUNT(*) FROM "Invoice";')
  const totalInvoices = parseInt(totalRes.rows[0].count, 10)

  // 2. Invoices with custom_fields in items
  const cfRes = await client.query(`
    SELECT COUNT(*) 
    FROM "Invoice" 
    WHERE "items"->'custom_fields' IS NOT NULL;
  `)
  const cfsCount = parseInt(cfRes.rows[0].count, 10)

  // 3. Sample 5 random invoices to view custom_fields contents
  const sampleRes = await client.query(`
    SELECT "zohoId", "amount", "items" 
    FROM "Invoice" 
    WHERE "items"->'custom_fields' IS NOT NULL 
    LIMIT 5;
  `)

  console.log(`• Total Invoices in DB: ${totalInvoices}`)
  console.log(`• Invoices with Custom Fields JSON: ${cfsCount}`)

  console.log("\n📄 SAMPLE INVOICE FINANCIAL FIELDS:")
  sampleRes.rows.forEach(r => {
    const items = r.items || {}
    const cfs = items.custom_fields || []
    const subTotal = items.sub_total || items.subTotal || r.amount
    const deadCost = items.deadCostTotal || items.dead_cost_total || cfs.find(c => (c.label || '').toUpperCase().includes('DEAD COST TOTAL'))?.value
    const deadProfit = subTotal - (deadCost || 0)

    console.log(`\n Invoice zohoId: ${r.zohoId}`)
    console.log(`   - Subtotal: $${subTotal}`)
    console.log(`   - Dead Cost Total: $${deadCost || 0}`)
    console.log(`   - Calculated Dead Profit: $${deadProfit}`)
    console.log(`   - Custom Fields in JSON: ${cfs.length}`)
  })

  await client.end()
}

checkDeadProfitCount().catch(console.error)
