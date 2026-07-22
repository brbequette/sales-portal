const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function inspectInv10910Raw() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== INSPECTING RAW JSON FOR INVOICE #10910 ===")

  const res = await client.query(`
    SELECT "id", "zohoId", "amount", "status", "issueDate", "items", "rawData"
    FROM "Invoice"
    WHERE "items"::text LIKE '%10910%' AND "status" = 'draft';
  `)

  if (res.rows.length > 0) {
    const inv = res.rows[0]
    console.log("Invoice JSON items:", JSON.stringify(inv.items, null, 2))
    console.log("\nRawData line items:", JSON.stringify(inv.rawData?.line_items || inv.rawData?.invoice?.line_items, null, 2))
  }

  await client.end()
}

inspectInv10910Raw().catch(console.error)
