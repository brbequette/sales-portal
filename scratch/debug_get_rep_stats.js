const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function debugGetRepStats() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== DEBUGGING REPS & HISTORICAL VIG RATES IN DATABASE ===")

  // 1. Fetch Users
  const usersRes = await client.query(`SELECT "id", "name", "email", "role" FROM "User" WHERE "role" IN ('ADMIN', 'AGENT');`)
  console.log(`Found ${usersRes.rows.length} Admin/Agent Users in DB:`)
  usersRes.rows.forEach(u => console.log(`  - ${u.name} (id: ${u.id}, email: ${u.email})`))

  // 2. Check if invoice salespersons match user names
  const salespersonRes = await client.query(`
    SELECT DISTINCT ("items"->>'salesperson') as salesperson
    FROM "Invoice"
    WHERE "items"->>'salesperson' IS NOT NULL;
  `)
  console.log("\nUnique Salesperson names in Invoice items:")
  salespersonRes.rows.forEach(r => console.log(`  - "${r.salesperson}"`))

  await client.end()
}

debugGetRepStats().catch(console.error)
