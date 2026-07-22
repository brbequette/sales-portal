const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testRossCommissions() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== DIAGNOSING ROSS HAISLER COMMISSIONS ===")

  // 1. Check user record for Ross Haisler
  const userRes = await client.query(`
    SELECT "id", "name", "email" FROM "User"
    WHERE LOWER("name") LIKE '%ross%' OR LOWER("email") LIKE '%ross%';
  `)
  console.log("Ross Haisler User Record(s):", userRes.rows)

  // 2. Check invoices with salesperson Ross
  const invRes = await client.query(`
    SELECT "id", "issueDate", "status", "amount", "items"
    FROM "Invoice"
    WHERE LOWER("items"::text) LIKE '%ross%'
    LIMIT 10;
  `)
  console.log(`Invoices matching 'ross': ${invRes.rows.length} found. Sample:`)
  if (invRes.rows.length > 0) {
    const inv = invRes.rows[0]
    console.log("Sample Invoice Items JSON:", {
      salesperson: inv.items.salesperson,
      sub_total: inv.items.sub_total,
      deadCostTotal: inv.items.deadCostTotal,
      vigRate: inv.items.vigRate,
      deadCostPlusVig: inv.items.deadCostPlusVig,
      profit: inv.items.profit
    })
  }

  // 3. Check payouts for Ross Haisler
  if (userRes.rows.length > 0) {
    const rossId = userRes.rows[0].id
    const payoutsRes = await client.query(`
      SELECT "id", "amount", "date", "notes" FROM "Payout"
      WHERE "repId" = $1;
    `, [rossId])
    console.log(`Payouts for Ross (${rossId}): ${payoutsRes.rows.length} found.`)
    let totalPaid = 0
    payoutsRes.rows.forEach(p => {
      totalPaid += parseFloat(p.amount)
      console.log(`  - Payout ID: ${p.id} | Amount: $${p.amount} | Date: ${p.date}`)
    })
    console.log(`Total Payouts Paid to Ross: $${totalPaid.toFixed(2)}`)
  }

  await client.end()
}

testRossCommissions().catch(console.error)
