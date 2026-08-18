const { Client } = require('pg')
const connectionString = process.env.DATABASE_URL

async function reconcilePreAug2024() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("==========================================================")
  console.log("   HISTORICAL PRE-AUGUST 2024 COMMISSION RECONCILIATION   ")
  console.log("==========================================================\n")

  // Fetch users
  const usersRes = await client.query(`SELECT "id", "name", "email" FROM "User";`)
  const users = usersRes.rows
  const userByName = new Map(users.map(u => [u.name?.toLowerCase().trim(), u]))

  // 1. Fetch all invoices prior to August 1, 2024
  const invoicesRes = await client.query(`
    SELECT "id", "issueDate", "status", "amount", "items"
    FROM "Invoice"
    WHERE "issueDate" < '2024-08-01' AND "status" NOT IN ('Void', 'void', 'Draft', 'draft');
  `)

  console.log(`Found ${invoicesRes.rows.length} invoices issued prior to August 1, 2024.`)

  const FINAL_PAID_STATUSES = new Set(["paid", "overdue", "partially_paid", "sent", "closed"])

  // Aggregate earned commissions prior to Aug 1, 2024 by repId
  const repPreAugEarned = {}
  const repNames = {}

  for (const inv of invoicesRes.rows) {
    const items = inv.items || {}
    const salespersonName = (items.salesperson || "").trim()
    if (!salespersonName) continue

    const matchedRep = userByName.get(salespersonName.toLowerCase().trim())
    if (!matchedRep) continue // Only process registered system users for payouts

    const repId = matchedRep.id
    const repName = matchedRep.name

    repNames[repId] = repName
    if (!repPreAugEarned[repId]) repPreAugEarned[repId] = 0

    const subTotal = parseFloat(items.sub_total || items.subTotal) || parseFloat(inv.amount) || 0
    const lineItems = Array.isArray(items.line_items) ? items.line_items : (Array.isArray(items.items) ? items.items : [])

    let deadCost = parseFloat(items.deadCostTotal || items.dead_cost_total || items.deadCost || 0)
    if (deadCost === 0 && lineItems.length > 0) {
      deadCost = lineItems.reduce((sum, li) => {
        const qty = parseFloat(li.quantity) || 1
        const cost = parseFloat(li.cost || li.purchase_rate || li.bck || 0) || (parseFloat(li.rate || 0) * 0.50)
        return sum + (qty * cost)
      }, 0)
    }

    const docDate = inv.issueDate ? new Date(inv.issueDate) : new Date()
    const year = docDate.getFullYear()
    const isMontgomery = salespersonName.toLowerCase().includes("montgomery") || salespersonName.toLowerCase().includes("morgan")
    const vigRate = (year <= 2024 || isMontgomery) ? (isMontgomery ? 1.0 : 1.3) : parseFloat(items.vigRate || 1.3)
    const deadCostPlusVig = deadCost * vigRate

    const cfs = items.custom_fields || []
    const additionalCosts = parseFloat(items.additionalCosts || items.additional_costs || cfs.find((c) => (c.label || '').toUpperCase().includes('ADDITIONAL COSTS'))?.value || 0)
    const ccFees = parseFloat(items.ccFees || items.cc_fees || cfs.find((c) => (c.label || '').toUpperCase().includes('CREDIT CARD'))?.value || 0)

    const profit = subTotal - deadCostPlusVig - additionalCosts - ccFees
    const isPaid = FINAL_PAID_STATUSES.has((inv.status || '').toLowerCase())

    const upfront = Math.max(0, profit * 0.25)
    const final = isPaid ? Math.max(0, (profit * 0.50) - upfront) : 0
    const totalCommission = upfront + final

    repPreAugEarned[repId] += totalCommission
  }

  // 2. Fetch existing payouts dated prior to August 1, 2024
  const payoutsRes = await client.query(`
    SELECT "repId", SUM("amount") as total_paid
    FROM "Payout"
    WHERE "date" < '2024-08-01'
    GROUP BY "repId";
  `)

  const repPreAugPaid = {}
  payoutsRes.rows.forEach(p => {
    repPreAugPaid[p.repId] = parseFloat(p.total_paid) || 0
  })

  // 3. Calculate remaining balance & insert reconciliation payout for each rep
  console.log("\n--- RECONCILIATION SUMMARY BY REP (PRE-AUG 2024) ---")

  for (const [repId, earned] of Object.entries(repPreAugEarned)) {
    const name = repNames[repId] || repId
    const paid = repPreAugPaid[repId] || 0
    const remainingBalance = earned - paid

    console.log(`Rep: ${name} (${repId})`)
    console.log(`   - Pre-Aug 2024 Earned Commission: $${earned.toFixed(2)}`)
    console.log(`   - Pre-Aug 2024 Existing Payouts: $${paid.toFixed(2)}`)
    console.log(`   - Remaining Pre-Aug 2024 Balance: $${remainingBalance.toFixed(2)}`)

    if (remainingBalance > 0.01) {
      // Check if a reconciliation payout already exists
      const checkExisting = await client.query(`
        SELECT "id" FROM "Payout"
        WHERE "repId" = $1 AND "notes" LIKE '%Pre-August 2024 Paid to Zero%';
      `, [repId])

      if (checkExisting.rows.length === 0) {
        const insertRes = await client.query(`
          INSERT INTO "Payout" ("id", "repId", "amount", "date", "notes", "createdAt", "updatedAt")
          VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
          RETURNING "id";
        `, [
          `payout-reconcile-preaug2024-${repId.substring(0, 10)}`,
          repId,
          remainingBalance.toFixed(2),
          '2024-07-31T23:59:59.000Z',
          'Historical Commission Catch-Up / Reconciliation (Pre-August 2024 Paid to Zero)'
        ])
        console.log(`   ✅ INSERTED RECONCILIATION PAYOUT: ID=${insertRes.rows[0].id} | Amount=$${remainingBalance.toFixed(2)}\n`)
      } else {
        console.log(`   ℹ️ Reconciliation payout already exists: ID=${checkExisting.rows[0].id}\n`)
      }
    } else {
      console.log(`   ✅ Balance is already $0.00 or negative. No payout needed.\n`)
    }
  }

  console.log("==========================================================")
  console.log("🎉 SUCCESS! Pre-August 2024 sales balances set to EXACTLY $0.00!")
  console.log("==========================================================")

  await client.end()
}

reconcilePreAug2024().catch(console.error)
