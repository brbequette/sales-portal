const { Client } = require('pg')

async function testPing() {
  console.log("=== PINGING DATABASE ENDPOINTS ===")
  const connString1 = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"
  const connStringPooler = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez-pooler.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

  try {
    const c1 = new Client({ connectionString: connString1, connectionTimeoutMillis: 5000 })
    await c1.connect()
    console.log("✅ Connection 1 (direct) SUCCESS!")
    const res = await c1.query("SELECT COUNT(*) FROM \"User\";")
    console.log("User count via direct:", res.rows[0].count)
    await c1.end()
  } catch (e) {
    console.error("❌ Direct connection error:", e.message)
  }

  try {
    const c2 = new Client({ connectionString: connStringPooler, connectionTimeoutMillis: 5000 })
    await c2.connect()
    console.log("✅ Connection 2 (pooler) SUCCESS!")
    const res = await c2.query("SELECT COUNT(*) FROM \"User\";")
    console.log("User count via pooler:", res.rows[0].count)
    await c2.end()
  } catch (e) {
    console.error("❌ Pooler connection error:", e.message)
  }
}

testPing()
