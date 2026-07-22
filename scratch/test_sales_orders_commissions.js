const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testSalesOrders() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== CHECKING SALES ORDERS IN DB ===")

  const res = await client.query(`
    SELECT "id", "zohoId", "amount", "status", "orderDate", "items", "accountId"
    FROM "SalesOrder"
    LIMIT 20;
  `)

  console.log(`Total SalesOrders checked (sample of 20 out of ${res.rows.length}):`)
  const countRes = await client.query(`SELECT COUNT(*)::int as count FROM "SalesOrder";`)
  console.log(`Total SalesOrders in DB: ${countRes.rows[0].count}`)

  if (res.rows.length > 0) {
    console.log("\nSample SalesOrder item structure:")
    const sample = res.rows[0]
    console.log({
      id: sample.id,
      zohoId: sample.zohoId,
      amount: sample.amount,
      status: sample.status,
      orderDate: sample.orderDate,
      salesperson: sample.items?.salesperson,
      sub_total: sample.items?.sub_total,
      line_items_count: (sample.items?.line_items || sample.items?.items || []).length
    })
  }

  await client.end()
}

testSalesOrders().catch(console.error)
