const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testSoInvoiceLink() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== EXAMINING SALES ORDER VS INVOICE LINKING & STATUSES ===")

  const soRes = await client.query(`
    SELECT "id", "zohoId", "amount", "status", "orderDate", "items"
    FROM "SalesOrder";
  `)

  console.log(`Total SalesOrders in DB: ${soRes.rows.length}`)

  const statusCounts = {}
  soRes.rows.forEach(so => {
    const st = (so.status || "Unknown").toLowerCase()
    statusCounts[st] = (statusCounts[st] || 0) + 1
  })

  console.log("SalesOrder Status Counts:", statusCounts)

  // Check sample sales orders to see custom_fields or items metadata
  const sampleSo = soRes.rows.find(so => (so.status || '').toLowerCase() !== 'invoiced') || soRes.rows[0]
  console.log("\nSample Non-Invoiced SalesOrder JSON:", {
    id: sampleSo.id,
    zohoId: sampleSo.zohoId,
    amount: sampleSo.amount,
    status: sampleSo.status,
    salesperson: sampleSo.items?.salesperson,
    sub_total: sampleSo.items?.sub_total,
    salesorder_number: sampleSo.items?.salesorder_number
  })

  await client.end()
}

testSoInvoiceLink().catch(console.error)
