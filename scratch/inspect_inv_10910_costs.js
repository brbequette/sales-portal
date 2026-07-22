const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function inspectInv10910Costs() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== CALCULATING COSTS FOR INVOICE #10910 ===")

  const res = await client.query(`
    SELECT "id", "zohoId", "amount", "status", "issueDate", "items"
    FROM "Invoice"
    WHERE "items"::text LIKE '%10910%';
  `)

  for (const inv of res.rows) {
    const items = inv.items || {}
    const invNum = items.invoiceNumber || items.invoice_number || inv.id
    console.log(`\nDocument Invoice #${invNum} (Status: ${inv.status}, IssueDate: ${inv.issueDate}):`)
    console.log(`Salesperson: ${items.salesperson}`)
    console.log(`Subtotal: $${items.sub_total || items.subTotal || inv.amount}`)

    const lineItems = items.line_items || items.items || []
    console.log(`Line items count: ${lineItems.length}`)

    let deadCostSubjectToVig = 0
    let deadCostNoVig = 0

    lineItems.forEach((li, idx) => {
      const qty = parseFloat(li.quantity || 1)
      const rate = parseFloat(li.rate || 0)
      const cost = parseFloat(li.purchase_rate || li.cost || li.bck || 0) || (rate * 0.50)
      const itemTotal = qty * rate
      const itemDeadCost = qty * cost
      const isGift = (li.name || '').toLowerCase().includes('gift') || (li.description || '').toLowerCase().includes('gift')
      const isNoVig = isGift

      if (isNoVig) deadCostNoVig += itemDeadCost
      else deadCostSubjectToVig += itemDeadCost

      console.log(`  [Item ${idx + 1}] SKU="${li.sku || ''}" Name="${li.name}" | Qty=${qty} | Rate=$${rate} | Cost=$${cost} | DeadCost=$${itemDeadCost} ${isGift ? '[GIFT]' : ''}`)
    })

    const deadCostTotal = deadCostSubjectToVig + deadCostNoVig
    const vigRate = 1.3
    const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig
    const subTotal = parseFloat(items.sub_total || items.subTotal || inv.amount || 0)
    const profit = subTotal - deadCostPlusVig

    console.log(`Total Dead Cost: $${deadCostTotal.toFixed(2)}`)
    console.log(`VIG Rate: ${vigRate}x`)
    console.log(`Dead Cost + VIG: $${deadCostPlusVig.toFixed(2)}`)
    console.log(`Net Profit after VIG: $${profit.toFixed(2)}`)
    console.log(`50% Rep Commission: $${(profit * 0.50).toFixed(2)}`)
  }

  await client.end()
}

inspectInv10910Costs().catch(console.error)
