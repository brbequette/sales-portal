const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function testPush() {
  const client = new Client({ connectionString })
  await client.connect()

  // Fetch token from DB
  const tokenRes = await client.query('SELECT value FROM "SystemSetting" WHERE key = \'zoho_access_token\';')
  const token = tokenRes.rows[0]?.value

  if (!token) {
    console.error("No Zoho access token found!")
    await client.end()
    return
  }

  console.log("Found active Zoho access token. Testing Zoho Books API GET invoice...")

  // Fetch 1 sample invoice from DB
  const invRes = await client.query('SELECT "zohoId", "items" FROM "Invoice" LIMIT 1;')
  const sampleInv = invRes.rows[0]

  console.log(`Sample Invoice zohoId: ${sampleInv.zohoId}`)

  // Test GET request to Zoho Books API
  const orgId = "664670946"
  const url = `https://www.zohoapis.com/books/v3/invoices/${sampleInv.zohoId}?organization_id=${orgId}`

  const response = await fetch(url, {
    headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
  })

  console.log(`Zoho Books API Response Status: ${response.status} ${response.statusText}`)
  if (response.ok) {
    const data = await response.json()
    console.log(`Invoice Number: ${data.invoice?.invoice_number}`)
    console.log(`Live Zoho Custom Fields Count: ${data.invoice?.custom_fields?.length || 0}`)
    if (data.invoice?.custom_fields) {
      data.invoice.custom_fields.forEach(c => console.log(` - ${c.label}: ${c.value}`))
    }
  } else {
    const errText = await response.text()
    console.log("Zoho API Response Body:", errText)
  }

  await client.end()
}

testPush().catch(console.error)
