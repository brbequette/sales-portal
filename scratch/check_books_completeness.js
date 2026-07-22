const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function checkCompleteness() {
  const client = new Client({ connectionString })
  await client.connect()

  const tokenRes = await client.query('SELECT value FROM "SystemSetting" WHERE key = \'zoho_access_token\';')
  const token = tokenRes.rows[0]?.value
  const orgId = "664670946"

  console.log("=== CHECKING RECENT ZOHO BOOKS INVOICES & CUSTOM FIELDS ===")

  // Fetch 10 most recent invoices from Zoho Books API
  const listUrl = `https://www.zohoapis.com/books/v3/invoices?organization_id=${orgId}&sort_column=created_time&sort_order=D&per_page=10`
  const res = await fetch(listUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${token}` } })

  if (res.ok) {
    const data = await res.json()
    console.log(`Fetched ${data.invoices?.length || 0} recent invoices from Zoho Books:`)
    for (const inv of (data.invoices || [])) {
      console.log(`\n📄 Invoice #${inv.invoice_number} | Date: ${inv.date} | Total: $${inv.total} | Status: ${inv.status}`)
      // Fetch details for custom fields
      const detailUrl = `https://www.zohoapis.com/books/v3/invoices/${inv.invoice_id}?organization_id=${orgId}`
      const dRes = await fetch(detailUrl, { headers: { 'Authorization': `Zoho-oauthtoken ${token}` } })
      if (dRes.ok) {
        const dData = await dRes.json()
        const cfs = dData.invoice?.custom_fields || []
        console.log(`   Custom Fields (${cfs.length}):`)
        cfs.forEach(c => console.log(`    - ${c.label}: "${c.value}"`))
      }
    }
  } else {
    console.log("Error listing invoices:", await res.text())
  }

  await client.end()
}

checkCompleteness().catch(console.error)
