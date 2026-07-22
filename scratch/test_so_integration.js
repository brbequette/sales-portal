const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testSoIntegration() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== TESTING SALES ORDER INTEGRATION INTO COMMISSIONS ===")

  // Fetch all invoices
  const invRes = await client.query(`SELECT "id", "zohoId", "amount", "status", "issueDate", "items" FROM "Invoice";`)
  const invoices = invRes.rows

  // Build set of salesorder IDs / numbers referenced by Invoices
  const invoicedSoIds = new Set()
  invoices.forEach(inv => {
    const items = inv.items || {}
    if (items.salesorder_id) invoicedSoIds.add(items.salesorder_id)
    if (items.salesorder_number) invoicedSoIds.add(items.salesorder_number)
  })

  console.log(`Invoices count: ${invoices.length}. Found ${invoicedSoIds.size} referenced SalesOrder IDs/numbers inside Invoices.`)

  // Fetch all SalesOrders
  const soRes = await client.query(`SELECT "id", "zohoId", "amount", "status", "orderDate", "items" FROM "SalesOrder";`)
  const salesOrders = soRes.rows

  let openSoCount = 0
  let openSoValue = 0

  salesOrders.forEach(so => {
    const items = so.items || {}
    const soNum = items.salesorder_number || so.zohoId
    const status = (so.status || "").toLowerCase()

    const isAlreadyInvoiced = status === 'invoiced' || invoicedSoIds.has(so.zohoId) || invoicedSoIds.has(soNum)

    if (!isAlreadyInvoiced && !['void', 'draft', 'cancelled'].includes(status)) {
      openSoCount++
      openSoValue += (parseFloat(items.sub_total || items.subTotal) || parseFloat(so.amount) || 0)
    }
  })

  console.log(`Active Non-Invoiced Sales Orders: ${openSoCount} count | Total Value: $${openSoValue.toFixed(2)}`)

  await client.end()
}

testSoIntegration().catch(console.error)
