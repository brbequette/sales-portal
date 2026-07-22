const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function test() {
  const client = new Client({ connectionString })
  await client.connect()

  const res = await client.query('SELECT key, value FROM "SystemSetting";')
  console.log("SYSTEM SETTINGS IN DB:")
  res.rows.forEach(r => console.log(` - ${r.key}: ${r.value ? r.value.substring(0, 15) + '...' : 'empty'}`))

  await client.end()
}

test().catch(console.error)
