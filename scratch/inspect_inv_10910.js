const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function inspectInv10910() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== INSPECTING INVOICE #10910 ===")

  const res = await client.query(`
    SELECT "id", "zohoId", "amount", "status", "issueDate", "items"
    FROM "Invoice"
    WHERE "items"::text LIKE '%10910%';
  `)

  console.log(`Matching records for #10910: ${res.rows.length}`)

  for (const inv of res.rows) {
    const items = inv.items || {}
    console.log({
      id: inv.id,
      zohoId: inv.zohoId,
      amount: inv.amount,
      status: inv.status,
      issueDate: inv.issueDate,
      invoiceNumber: items.invoiceNumber || items.invoice_number,
      salesperson: items.salesperson,
      sub_total: items.sub_total || items.subTotal,
      deadCostTotal: items.deadCostTotal,
      profit: items.profit,
      line_items: items.line_items || items.items
    })
  }

  await client.end()
}

inspectInv10910().catch(console.error)
