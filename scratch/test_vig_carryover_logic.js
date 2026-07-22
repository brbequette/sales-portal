const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testVigCarryover() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== TESTING VIG CARRY-OVER RESOLUTION ENGINE ===")

  // 1. Fetch Users
  const usersRes = await client.query(`SELECT "id", "name", "email", "constantVigEnabled", "constantVigValue" FROM "User";`)
  const users = usersRes.rows

  // 2. Fetch MonthlyVigGoals
  const goalsRes = await client.query(`SELECT "repId", "monthKey", "metric", "profitGoal", "subtotalGoal", "manualVigRate" FROM "MonthlyVigGoal";`)
  const goalsMap = {}
  goalsRes.rows.forEach(g => {
    const key = `${g.repId}_${g.monthKey}`
    goalsMap[key] = g
  })

  // 3. Fetch all valid Invoices
  const invRes = await client.query(`
    SELECT "id", "issueDate", "amount", "status", "items"
    FROM "Invoice"
    WHERE "status" NOT IN ('Void', 'void', 'Draft', 'draft');
  `)

  // Group invoices by monthKey and repId
  const monthlyRepStats = {}

  invRes.rows.forEach(inv => {
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

  // Build ordered list of month keys from 2024-01 to 2026-07
  const allMonthKeys = []
  for (let year = 2024; year <= 2026; year++) {
    const endMonth = year === 2026 ? 7 : 12
    for (let m = 1; m <= endMonth; m++) {
      allMonthKeys.push(`${year}-${String(m).padStart(2, '0')}`)
    }
  }

  // Calculate VIG Rate for each rep for each month chronologically
  console.log("\n--- CHRONOLOGICAL VIG RATE RESOLUTION TABLE ---")

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

      // Resolve VIG Rate for monthKey
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
        vigRate = 1.3 // Baseline Jan 2025
      } else {
        // Carry over from prior month (i - 1)
        const priorMonthKey = allMonthKeys[i - 1]
        const priorGoal = goalResults[u.id][priorMonthKey]
        vigRate = (priorGoal && priorGoal.metGoal) ? 1.3 : 1.5
      }

      calculatedVigRates[u.id][monthKey] = vigRate
    }
  })

  // Print sample for Ross Haisler & Montgomery Morgan & Bobby Salyers
  const ross = users.find(u => u.name?.toLowerCase().includes("ross"))
  if (ross) {
    console.log(`\nResults for Ross Haisler (${ross.id}):`)
    allMonthKeys.filter(k => k >= '2025-01').forEach(monthKey => {
      const v = calculatedVigRates[ross.id][monthKey]
      const g = goalResults[ross.id][monthKey]
      console.log(`  - ${monthKey}: VIG=${v.toFixed(1)}x | Metric=${g.metric} | Target=$${g.target.toLocaleString()} | Actual=$${g.actual.toFixed(2)} | MetGoal=${g.metGoal ? '✅ YES' : '❌ MISSED -> Penalty next month'}`)
    })
  }

  const bobby = users.find(u => u.name?.toLowerCase().includes("bobby"))
  if (bobby) {
    console.log(`\nResults for Bobby Salyers (${bobby.id}):`)
    allMonthKeys.filter(k => k >= '2025-01').forEach(monthKey => {
      const v = calculatedVigRates[bobby.id][monthKey]
      const g = goalResults[bobby.id][monthKey]
      console.log(`  - ${monthKey}: VIG=${v.toFixed(1)}x | Metric=${g.metric} | Target=$${g.target.toLocaleString()} | Actual=$${g.actual.toFixed(2)} | MetGoal=${g.metGoal ? '✅ YES' : '❌ MISSED -> Penalty next month'}`)
    })
  }

  await client.end()
}

testVigCarryover().catch(console.error)
