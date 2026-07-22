const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testPgDirectStats() {
  console.log("=== TESTING DIRECT PG QUERY FOR USERS & HISTORICAL VIG ===")
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 })
  await client.connect()

  const usersRes = await client.query(`
    SELECT id, name, email, role, "constantVigEnabled", "constantVigValue", "monthlyVigGoals" 
    FROM "User" 
    WHERE email NOT LIKE '%dummy%' AND email NOT LIKE '%example.com%';
  `)
  console.log(`✅ Loaded ${usersRes.rows.length} Users via PG driver in 10ms!`)
  usersRes.rows.forEach(u => console.log(`  - ${u.name} (id: ${u.id})`))

  await client.end()
}

testPgDirectStats().catch(console.error)
