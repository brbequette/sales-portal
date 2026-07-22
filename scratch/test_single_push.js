const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

async function pushInvoice10911() {
  const client = new Client({ connectionString })
  await client.connect()

  const tokenRes = await client.query('SELECT value FROM "SystemSetting" WHERE key = \'zoho_access_token\';')
  const token = tokenRes.rows[0]?.value
  const orgId = "664670946"

  // Fetch Invoice 10911 from DB
  const invRes = await client.query('SELECT "zohoId", "items" FROM "Invoice" WHERE "items"->>\'invoiceNumber\' LIKE \'%10911%\' OR "items"->>\'invoice_number\' LIKE \'%10911%\';')
  if (invRes.rows.length === 0) {
    console.error("Invoice 10911 not found in local DB")
    await client.end()
    return
  }

  const sampleInv = invRes.rows[0]
  console.log(`Found Invoice 10911 locally | zohoId: ${sampleInv.zohoId}`)

  // Get custom fields payload
  const cfs = [
    { label: "DEAD COST TOTAL", value: 2016.60 },
    { label: "DEAD COST PLUS VIG", value: 2621.58 },
    { label: "PROFIT", value: 2295.54 },
    { label: "SALES COMMISSION", value: 1147.77 },
    { label: "SALESPERSON VIG", value: 1.3 },
    { label: "COMMISSION FROM PROFIT %", value: 50 },
    { label: "COMMISSION STATUS", value: "Pending" }
  ]

  console.log("Pushing custom fields to live Zoho Books for Invoice 10911...")
  const url = `https://www.zohoapis.com/books/v3/invoices/${sampleInv.zohoId}?organization_id=${orgId}`

  const payload = {
    custom_fields: cfs
  }

  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Zoho-oauthtoken ${token}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  })

  console.log(`Response status: ${res.status} ${res.statusText}`)
  const resText = await res.text()
  console.log("Response body:", resText)

  await client.end()
}

pushInvoice10911().catch(console.error)
