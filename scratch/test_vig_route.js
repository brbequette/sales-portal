const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testVigRoute() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("=== TESTING VIG ROUTE DB QUERY ===")

  try {
    const res = await client.query(`
      SELECT "id", "name", "email", "role", "constantVigEnabled", "constantVigValue"
      FROM "User"
      WHERE "email" NOT LIKE '%dummy.titandiamond.com%'
      ORDER BY "name" ASC;
    `)
    console.log(`Successfully fetched ${res.rows.length} users!`)
    console.log("Sample user:", res.rows[0])
  } catch (err) {
    console.error("Error executing query:", err)
  }

  await client.end()
}

testVigRoute()
