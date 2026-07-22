const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function auditInvoiceCosts() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("==========================================================")
  console.log("   COMPLETE DATABASE INVOICE & COST AUDIT REPORT          ")
  console.log("==========================================================\n")

  const invRes = await client.query(`
    SELECT "id", "status", "amount", "items"
    FROM "Invoice";
  `)

  const totalInvoices = invRes.rows.length
  let withLineItems = 0
  let withPrecomputedDeadCost = 0
  let withBooksPurchaseRate = 0
  let usingCostFallback = 0
  let totalSubtotal = 0
  let totalCalculatedDeadCost = 0

  for (const inv of invRes.rows) {
    const items = inv.items || {}
    const subtotal = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount) || 0
    totalSubtotal += subtotal

    const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])
    if (lineItems.length > 0) withLineItems++

    if (items.deadCostTotal && parseFloat(items.deadCostTotal) > 0) {
      withPrecomputedDeadCost++
    }

    let hasExplicitCost = false
    let itemDeadCostSum = 0

    lineItems.forEach(li => {
      const qty = parseFloat(li.quantity || 1)
      const cost = parseFloat(li.purchase_rate || li.cost || li.bck || 0)
      if (cost > 0) hasExplicitCost = true
      const fallbackCost = cost > 0 ? cost : (parseFloat(li.rate || 0) * 0.50)
      itemDeadCostSum += (qty * fallbackCost)
    })

    if (hasExplicitCost) withBooksPurchaseRate++

    let finalDeadCost = parseFloat(items.deadCostTotal || 0)
    if (finalDeadCost === 0 && lineItems.length > 0) {
      finalDeadCost = itemDeadCostSum
    }
    if (finalDeadCost === 0 && subtotal > 0) {
      finalDeadCost = subtotal * 0.50
      usingCostFallback++
    }

    totalCalculatedDeadCost += finalDeadCost
  }

  console.log(`Total Invoices Audited: ${totalInvoices.toLocaleString()}`)
  console.log(`- Invoices with Line Items Array: ${withLineItems.toLocaleString()} (${((withLineItems / totalInvoices) * 100).toFixed(1)}%)`)
  console.log(`- Invoices with Pre-Computed deadCostTotal: ${withPrecomputedDeadCost.toLocaleString()} (${((withPrecomputedDeadCost / totalInvoices) * 100).toFixed(1)}%)`)
  console.log(`- Invoices with Explicit Purchase Rates in Books: ${withBooksPurchaseRate.toLocaleString()} (${((withBooksPurchaseRate / totalInvoices) * 100).toFixed(1)}%)`)
  console.log(`- Invoices using Automatic Base Product Cost Fallback (50%): ${usingCostFallback.toLocaleString()} (${((usingCostFallback / totalInvoices) * 100).toFixed(1)}%)`)
  console.log(`\nFinancial Aggregates:`)
  console.log(`- Total Invoiced Revenue: $${totalSubtotal.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
  console.log(`- Total Product Dead Costs: $${totalCalculatedDeadCost.toLocaleString(undefined, { minimumFractionDigits: 2 })}`)
  console.log(`- Average Cost Ratio: ${((totalCalculatedDeadCost / totalSubtotal) * 100).toFixed(1)}%`)

  await client.end()
}

auditInvoiceCosts().catch(console.error)
