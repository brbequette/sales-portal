const { Client } = require('pg')
const connectionString = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require"

const orgId = "664670946"

async function pushAllCalculatedFieldsToZoho() {
  console.log("=== PUSHING ALL CALCULATED FINANCIAL CUSTOM FIELDS DIRECTLY TO ZOHO BOOKS ===")

  const client = new Client({ connectionString })
  await client.connect()

  // Get live access token from DB
  const tokenRes = await client.query('SELECT value FROM "SystemSetting" WHERE key = \'zoho_access_token\';')
  const token = tokenRes.rows[0]?.value

  if (!token) {
    console.error("No valid Zoho access token found in database.")
    await client.end()
    return
  }

  // Fetch recent invoices from DB that have items JSON
  const invRes = await client.query(`
    SELECT "zohoId", "items" 
    FROM "Invoice" 
    WHERE "zohoId" IS NOT NULL 
    ORDER BY "createdAt" DESC 
    LIMIT 200;
  `)

  console.log(`Found ${invRes.rows.length} recent invoices in DB. Pushing calculated custom fields to Zoho Books API...`)

  let successCount = 0
  let skippedCount = 0

  for (let i = 0; i < invRes.rows.length; i++) {
    const inv = invRes.rows[i]
    const items = inv.items || {}
    const invNumber = items.invoiceNumber || items.invoice_number || inv.zohoId

    // Extract calculated financial numbers
    const cfs = items.custom_fields || []

    const deadCost = items.deadCostTotal ?? items.dead_cost_total ?? cfs.find(c => (c.label || '').toUpperCase().includes('DEAD COST TOTAL'))?.value
    const profit = items.profit ?? cfs.find(c => (c.label || '').toUpperCase() === 'PROFIT' || (c.label || '').toUpperCase() === 'RECALCULATED PROFIT')?.value
    const comm = items.salesCommission ?? items.commission ?? cfs.find(c => (c.label || '').toUpperCase().includes('SALES COMMISSION'))?.value
    const deadCostPlusVig = items.deadCostPlusVig ?? items.dead_cost_plus_vig ?? cfs.find(c => (c.label || '').toUpperCase().includes('DEAD COST PLUS VIG'))?.value

    if (deadCost === undefined && profit === undefined && comm === undefined) {
      skippedCount++
      continue
    }

    const payloadCFs = [
      { label: "SALESPERSON VIG", value: items.vigRate || 1.3 },
      { label: "COMMISSION FROM PROFIT %", value: 50 },
      { label: "COMMISSION STATUS", value: "Pending" }
    ]

    const subTotal = Number(items.sub_total || items.subTotal || 0)
    const deadProfit = items.deadProfit ?? (subTotal > 0 && deadCost !== undefined ? subTotal - Number(deadCost) : undefined) ?? cfs.find(c => (c.label || '').toUpperCase().includes('DEAD PROFIT'))?.value

    if (deadCost !== undefined) payloadCFs.push({ label: "DEAD COST TOTAL", value: Number(deadCost) })
    if (deadCostPlusVig !== undefined) payloadCFs.push({ label: "DEAD COST PLUS VIG", value: Number(deadCostPlusVig) })
    if (profit !== undefined) payloadCFs.push({ label: "PROFIT", value: Number(profit) })
    if (deadProfit !== undefined) payloadCFs.push({ label: "DEAD PROFIT (ACTUAL)", value: Number(deadProfit) })
    if (comm !== undefined) payloadCFs.push({ label: "SALES COMMISSION", value: Number(comm) })

    try {
      const url = `https://www.zohoapis.com/books/v3/invoices/${inv.zohoId}?organization_id=${orgId}`
      const res = await fetch(url, {
        method: 'PUT',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ custom_fields: payloadCFs })
      })

      if (res.ok) {
        successCount++
      } else {
        // If rate limited or error, pause briefly
        await new Promise(r => setTimeout(r, 500))
      }
    } catch (e) {
      // Continue on individual fetch error
    }

    if ((i + 1) % 25 === 0 || i + 1 === invRes.rows.length) {
      console.log(`Processed ${i + 1} / ${invRes.rows.length} invoices (${successCount} pushed to Zoho Books)...`)
    }

    // Rate limit delay: 150ms between requests to respect Zoho Books API
    await new Promise(r => setTimeout(r, 150))
  }

  console.log(`\n=== ZOHO BOOKS DIRECT PUSH COMPLETE ===`)
  console.log(`• Successfully Pushed to Zoho Books: ${successCount} Invoices`)
  console.log(`• Skipped (No financial data): ${skippedCount} Invoices`)

  await client.end()
}

pushAllCalculatedFieldsToZoho().catch(console.error)
