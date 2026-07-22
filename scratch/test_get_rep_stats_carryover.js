const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testGetRepStatsOutput() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== TESTING LIVE RECALCULATED VIG RATES FOR ROSS HAISLER & REPS ===")

  // Fetch Ross Haisler's ID
  const res = await client.query(`SELECT "id", "name" FROM "User" WHERE "name" ILIKE '%ross%';`)
  if (res.rows.length > 0) {
    console.log(`Ross Haisler User ID: ${res.rows[0].id}`)
  }

  await client.end()
}

testGetRepStatsOutput().catch(console.error)
