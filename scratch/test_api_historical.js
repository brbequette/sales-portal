const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function inspectHistoricalVig() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== INSPECTING MONTHLY VIG GOALS IN DATABASE ===")
  const goalsRes = await client.query(`SELECT * FROM "MonthlyVigGoal" LIMIT 50;`)
  console.log(`Found ${goalsRes.rows.length} MonthlyVigGoal records in DB:`)
  goalsRes.rows.forEach(g => {
    console.log(`  - RepId: ${g.repId} | Month: ${g.monthKey} | Metric: ${g.metric} | SubtotalGoal: ${g.subtotalGoal} | ProfitGoal: ${g.profitGoal} | ManualVig: ${g.manualVigRate} | LastSyncedVig: ${g.lastSyncedVigRate}`)
  })

  // Inspect invoice issueDates to see oldest invoice in DB
  const oldestInvRes = await client.query(`SELECT MIN("issueDate") as oldest_date, MAX("issueDate") as newest_date FROM "Invoice";`)
  console.log("\nInvoice Date Range in Database:")
  console.log(`  - Oldest issueDate: ${oldestInvRes.rows[0].oldest_date}`)
  console.log(`  - Newest issueDate: ${oldestInvRes.rows[0].newest_date}`)

  await client.end()
}

inspectHistoricalVig().catch(console.error)
