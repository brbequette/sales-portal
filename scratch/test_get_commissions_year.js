const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testGetCommissions() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== TESTING COMMISSIONS API MATCHING LOGIC ===")

  const usersRes = await client.query(`SELECT "id", "name", "email" FROM "User";`)
  const users = usersRes.rows

  console.log("Registered Users count:", users.length)
  users.forEach(u => console.log(`  - User: id=${u.id} | name="${u.name}" | email="${u.email}"`))

  const invoicesRes = await client.query(`SELECT "id", "issueDate", "status", "amount", "items" FROM "Invoice";`)
  const invoices = invoicesRes.rows

  console.log(`Total Invoices in DB: ${invoices.length}`)

  // Map salesperson strings found in invoices
  const salespersonCounts = {}
  invoices.forEach(inv => {
    const sp = (inv.items?.salesperson || "Unassigned").trim()
    salespersonCounts[sp] = (salespersonCounts[sp] || 0) + 1
  })

  console.log("\nSalesperson invoice counts in DB:", salespersonCounts)

  await client.end()
}

testGetCommissions().catch(console.error)
