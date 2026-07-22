const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function recalculateAllVigDocuments() {
  console.log("=== RECALCULATING VIG & COSTS FOR ALL HISTORICAL DOCUMENTS VIA PG DRIVER ===")
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 })
  await client.connect()

  // 1. Fetch system settings
  const settingsRes = await client.query('SELECT key, value FROM "SystemSetting";')
  const settingsMap = new Map(settingsRes.rows.map(s => [s.key, s.value]))
  const defaultVigRate = parseFloat(settingsMap.get("default_vig_rate") || "1.3")

  // 2. Fetch users
  const usersRes = await client.query('SELECT id, name, "constantVigEnabled", "constantVigValue" FROM "User";')
  const userMap = new Map(usersRes.rows.map(u => [u.id, u]))
  const userByName = new Map(usersRes.rows.map(u => [u.name ? u.name.toLowerCase().trim() : '', u]))

  // 3. Fetch all invoices
  const invoicesRes = await client.query('SELECT id, amount, items, "accountId" FROM "Invoice";')
  console.log(`Processing ${invoicesRes.rows.length} invoices...`)

  let updatedInvoices = 0
  for (const inv of invoicesRes.rows) {
    const items = inv.items || {}
    const cfs = items.custom_fields || []
    const salespersonName = items.salesperson
    const matchedRep = salespersonName ? userByName.get(salespersonName.toLowerCase().trim()) : (inv.accountId ? userMap.get(inv.accountId) : null)
    
    const subTotal = parseFloat(items.sub_total || items.subTotal) || inv.amount || 0
    const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    let deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || 0)
    if (deadCost === 0 && lineItems.length > 0) {
      deadCost = lineItems.reduce((sum, li) => {
        const qty = parseFloat(li.quantity) || 1
        const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
        return sum + (qty * cost)
      }, 0)
    }
    if (deadCost === 0 && subTotal > 0) {
      deadCost = subTotal * 0.50
    }

    const docDate = items.date ? new Date(items.date) : new Date()
    const year = docDate.getFullYear()
    const isMontgomery = (salespersonName && (salespersonName.toLowerCase().includes("montgomery") || salespersonName.toLowerCase().includes("morgan"))) || (matchedRep && matchedRep.name && matchedRep.name.toLowerCase().includes("montgomery"))
    
    let vigRate = 1.3
    if (matchedRep && matchedRep.constantVigEnabled && matchedRep.constantVigValue !== null) {
      vigRate = matchedRep.constantVigValue
    } else if (year <= 2024 || isMontgomery) {
      vigRate = isMontgomery ? 1.0 : 1.3
    } else if (items.manualVigRate) {
      vigRate = parseFloat(items.manualVigRate)
    } else {
      vigRate = parseFloat(items.vigRate || defaultVigRate)
    }

    const deadCostPlusVig = deadCost * vigRate
    const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || (cfs.find(c => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS')) || {}).value || 0)
    const giftsCost = parseFloat(items.gifts || items.gifts_cost || items.giftCost || (cfs.find(c => (c.label || '').toUpperCase().includes('GIFT')) || {}).value || 0)
    const ccFees = parseFloat(items.ccFees || items.cc_fees || (cfs.find(c => (c.label || '').toUpperCase().includes('CREDIT CARD')) || {}).value || 0)

    const profit = subTotal - deadCostPlusVig - additionalCosts - giftsCost - ccFees
    const deadProfit = subTotal - deadCost - additionalCosts - giftsCost - ccFees

    const updatedItems = {
      ...items,
      deadCostTotal: deadCost,
      vigRate: vigRate,
      deadCostPlusVig: deadCostPlusVig,
      additionalCosts: additionalCosts,
      giftsCost: giftsCost,
      ccFees: ccFees,
      profit: profit,
      deadProfit: deadProfit
    }

    await client.query('UPDATE "Invoice" SET items = $1 WHERE id = $2;', [JSON.stringify(updatedItems), inv.id])
    updatedInvoices++
  }

  console.log(`✅ Recalculated & updated ${updatedInvoices} invoices via PG driver!`)
  await client.end()
}

recalculateAllVigDocuments().catch(console.error)
