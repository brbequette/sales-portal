const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function killStaleConnections() {
  const client = new Client({ connectionString, connectionTimeoutMillis: 5000 })
  await client.connect()
  console.log("=== TERMINATING STALE DATABASE CONNECTIONS ===")

  const res = await client.query(`
    SELECT pid, state, query, age(clock_timestamp(), query_start) 
    FROM pg_stat_activity 
    WHERE state != 'idle' AND pid != pg_backend_pid();
  `)
  console.log(`Active connections: ${res.rows.length}`)
  res.rows.forEach(r => console.log(`  PID ${r.pid} | Age: ${r.age} | Query: ${r.query}`))

  // Terminate all idle or stale backends except current
  const termRes = await client.query(`
    SELECT pg_terminate_backend(pid) 
    FROM pg_stat_activity 
    WHERE pid != pg_backend_pid() AND datname = 'netlifydb';
  `)
  console.log(`Terminated ${termRes.rows.length} stale backend connection(s).`)

  await client.end()
}

killStaleConnections().catch(console.error)
