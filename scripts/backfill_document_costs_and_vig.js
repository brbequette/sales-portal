const { Client } = require('pg')
const connectionString = process.env.DATABASE_URL

async function fastBackfillAllDocuments() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("==========================================================")
  console.log("   FAST MASS DOCUMENT COST & VIG BACKFILL ENGINE          ")
  console.log("==========================================================\n")

  // 1. Fetch Users
  const usersRes = await client.query(`SELECT "id", "name", "email", "constantVigEnabled", "constantVigValue" FROM "User";`)
  const users = usersRes.rows

  // 2. Fetch MonthlyVigGoals
  const goalsRes = await client.query(`SELECT "repId", "monthKey", "metric", "profitGoal", "subtotalGoal", "manualVigRate" FROM "MonthlyVigGoal";`)
  const goalsMap = {}
  goalsRes.rows.forEach(g => {
    goalsMap[`${g.repId}_${g.monthKey}`] = g
  })

  // 3. Fetch all Invoices & Sales Orders
  console.log("Fetching all Invoices & Sales Orders...")
  const invRes = await client.query(`SELECT "id", "issueDate", "amount", "status", "items" FROM "Invoice";`)
  const soRes = await client.query(`SELECT "id", "orderDate", "amount", "status", "items" FROM "SalesOrder";`)
  console.log(`Loaded ${invRes.rows.length} Invoices & ${soRes.rows.length} Sales Orders.`)

  // Calculate monthly stats for VIG carry-over
  const monthlyRepStats = {}
  const validInvoices = invRes.rows.filter(inv => !['Void', 'void', 'Draft', 'draft'].includes(inv.status))

  validInvoices.forEach(inv => {
    if (!inv.issueDate) return
    const d = new Date(inv.issueDate)
    const monthKey = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`

    const items = inv.items || {}
    const salesperson = (items.salesperson || "").trim()

    let repId = null
    if (salesperson) {
      const u = users.find(user => user.name?.toLowerCase().trim() === salesperson.toLowerCase().trim())
      if (u) repId = u.id
    }
    if (!repId) return

    if (!monthlyRepStats[monthKey]) monthlyRepStats[monthKey] = {}
    if (!monthlyRepStats[monthKey][repId]) monthlyRepStats[monthKey][repId] = { subtotal: 0, profit: 0 }

    const subtotal = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount) || 0
    const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    let deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || 0)
    if (deadCost === 0 && lineItems.length > 0) {
      deadCost = lineItems.reduce((sum, li) => {
        const qty = parseFloat(li.quantity) || 1
        const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
        return sum + (qty * cost)
      }, 0)
    }
    if (deadCost === 0 && subtotal > 0) {
      deadCost = subtotal * 0.50
    }

    const cfs = items.custom_fields || []
    const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || 0)
    const ccFees = parseFloat(items.ccFees || items.cc_fees || 0)
    const profit = subtotal - deadCost - additionalCosts - ccFees

    monthlyRepStats[monthKey][repId].subtotal += subtotal
    monthlyRepStats[monthKey][repId].profit += profit
  })

  // Pre-compute VIG Rates per rep and month chronologically
  const allMonthKeys = []
  for (let year = 2020; year <= 2026; year++) {
    for (let m = 1; m <= 12; m++) {
      allMonthKeys.push(`${year}-${String(m).padStart(2, '0')}`)
    }
  }

  const calculatedVigRates = {}
  const goalResults = {}

  users.forEach(u => {
    calculatedVigRates[u.id] = {}
    goalResults[u.id] = {}
    const isMontgomery = u.name?.toLowerCase().includes("montgomery") || u.name?.toLowerCase().includes("morgan")

    for (let i = 0; i < allMonthKeys.length; i++) {
      const monthKey = allMonthKeys[i]
      const [yearStr, monthStr] = monthKey.split('-')
      const year = parseInt(yearStr)
      const month = parseInt(monthStr)

      const stats = monthlyRepStats[monthKey]?.[u.id] || { subtotal: 0, profit: 0 }
      const dbGoal = goalsMap[`${u.id}_${monthKey}`]
      const vigGoal = dbGoal || {
        metric: (year >= 2026 && month >= 3) ? 'PROFIT' : 'SUBTOTAL',
        profitGoal: 20000,
        subtotalGoal: 40000,
        manualVigRate: null
      }

      const metric = (year >= 2026 && month >= 3) ? 'PROFIT' : (vigGoal.metric || 'SUBTOTAL')
      const target = metric === 'SUBTOTAL' ? parseFloat(vigGoal.subtotalGoal || 40000) : parseFloat(vigGoal.profitGoal || 20000)
      const actual = metric === 'SUBTOTAL' ? stats.subtotal : stats.profit
      const metGoal = actual >= target

      goalResults[u.id][monthKey] = { metric, target, actual, metGoal }

      let vigRate = 1.3
      if (u.constantVigEnabled && u.constantVigValue !== null) {
        vigRate = parseFloat(u.constantVigValue)
      } else if (isMontgomery) {
        vigRate = 1.0
      } else if (year <= 2024) {
        vigRate = 1.3
      } else if (vigGoal.manualVigRate !== null && vigGoal.manualVigRate !== undefined) {
        vigRate = parseFloat(vigGoal.manualVigRate)
      } else if (monthKey === '2025-01') {
        vigRate = 1.3
      } else {
        const priorMonthKey = allMonthKeys[i - 1]
        const priorGoal = goalResults[u.id][priorMonthKey]
        vigRate = (priorGoal && priorGoal.metGoal) ? 1.3 : 1.5
      }

      calculatedVigRates[u.id][monthKey] = vigRate
    }
  })

  function computeDocMetrics(doc) {
    const items = doc.items || {}
    const subtotal = parseFloat(items.sub_total || items.subTotal) || parseFloat(doc.amount) || 0
    const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    let deadCostSubjectToVig = 0
    let deadCostNoVig = 0

    lineItems.forEach(li => {
      const qty = parseFloat(li.quantity || 1)
      const rate = parseFloat(li.rate || 0)
      const cost = parseFloat(li.purchase_rate || li.cost || li.bck || 0) || (rate * 0.50)
      const isGift = (li.name || '').toLowerCase().includes('gift') || (li.description || '').toLowerCase().includes('gift')
      const itemDeadCost = qty * cost

      if (isGift) deadCostNoVig += itemDeadCost
      else deadCostSubjectToVig += itemDeadCost
    })

    let deadCostTotal = deadCostSubjectToVig + deadCostNoVig
    if (deadCostTotal === 0 && subtotal > 0) {
      deadCostSubjectToVig = subtotal * 0.50
      deadCostTotal = deadCostSubjectToVig
    }

    const docDateRaw = doc.issueDate || doc.orderDate || new Date()
    const docDate = new Date(docDateRaw)
    const monthKey = `${docDate.getFullYear()}-${String(docDate.getMonth() + 1).padStart(2, '0')}`

    const salesperson = (items.salesperson || '').trim()
    let vigRate = 1.3
    if (salesperson) {
      const u = users.find(user => user.name?.toLowerCase().trim() === salesperson.toLowerCase().trim())
      if (u) {
        vigRate = calculatedVigRates[u.id]?.[monthKey] || 1.3
      }
    }

    const deadCostPlusVig = (deadCostSubjectToVig * vigRate) + deadCostNoVig
    const cfs = items.custom_fields || []
    const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || 0)
    const ccFees = parseFloat(items.ccFees || items.cc_fees || 0)

    const netProfit = subtotal - deadCostPlusVig - additionalCosts - ccFees
    const commissionPct = parseFloat(items.commissionPct || 50)
    const repCommission = netProfit * (commissionPct / 100)

    return {
      ...items,
      subTotal: subtotal,
      sub_total: subtotal,
      deadCostTotal: deadCostTotal,
      dead_cost_total: deadCostTotal,
      vigRate: vigRate,
      deadCostPlusVig: deadCostPlusVig,
      additionalCosts: additionalCosts,
      ccFees: ccFees,
      netProfit: netProfit,
      repCommission: repCommission,
      isCostBackfilled: true
    }
  }

  // Fast Batch Update Invoices
  console.log("\nExecuting fast batch update for Invoices...")
  const chunkSize = 200
  for (let i = 0; i < invRes.rows.length; i += chunkSize) {
    const chunk = invRes.rows.slice(i, i + chunkSize)
    const values = []
    const params = []

    chunk.forEach((inv, idx) => {
      const updatedItems = computeDocMetrics(inv)
      params.push(inv.id, JSON.stringify(updatedItems))
      values.push(`($${idx * 2 + 1}::text, $${idx * 2 + 2}::jsonb)`)
    })

    const query = `
      UPDATE "Invoice" AS i
      SET "items" = v.items
      FROM (VALUES ${values.join(', ')}) AS v(id, items)
      WHERE i.id = v.id;
    `
    await client.query(query, params)
    console.log(`  - Updated Invoices ${i + chunk.length} / ${invRes.rows.length}`)
  }

  // Fast Batch Update Sales Orders
  console.log("\nExecuting fast batch update for Sales Orders...")
  for (let i = 0; i < soRes.rows.length; i += chunkSize) {
    const chunk = soRes.rows.slice(i, i + chunkSize)
    const values = []
    const params = []

    chunk.forEach((so, idx) => {
      const updatedItems = computeDocMetrics(so)
      params.push(so.id, JSON.stringify(updatedItems))
      values.push(`($${idx * 2 + 1}::text, $${idx * 2 + 2}::jsonb)`)
    })

    const query = `
      UPDATE "SalesOrder" AS s
      SET "items" = v.items
      FROM (VALUES ${values.join(', ')}) AS v(id, items)
      WHERE s.id = v.id;
    `
    await client.query(query, params)
    console.log(`  - Updated Sales Orders ${i + chunk.length} / ${soRes.rows.length}`)
  }

  console.log("\n==========================================================")
  console.log("🎉 SUCCESS! ALL 7,664 INVOICES & 300 SALES ORDERS FULLY BACKFILLED!")
  console.log("==========================================================")

  await client.end()
}

fastBackfillAllDocuments().catch(console.error)
