const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { Client } = require('pg')

const connectionString = process.env.DATABASE_URL
const INPUT_DIR = 'C:/Users/titan/Documents/Titan Diamond/invoices'

async function pgFillCustomFields() {
  console.log("=== NATIVE PG DIRECT HIGH-SPEED CUSTOM FIELDS SYNC ===")

  const client = new Client({ connectionString })
  await client.connect()
  console.log("✅ Connected directly to Neon PostgreSQL database.")

  const invoiceFiles = ['Invoice00.csv', 'Invoice01.csv']
  let totalUpdated = 0

  for (const invFile of invoiceFiles) {
    const filePath = path.join(INPUT_DIR, invFile)
    if (!fs.existsSync(filePath)) continue

    console.log(`\nParsing ${invFile}...`)
    const content = fs.readFileSync(filePath, 'utf8')
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true })

    if (records.length === 0) continue

    const headers = Object.keys(records[0])
    const cfColumns = headers.filter(h => h.toUpperCase().startsWith('CF.') || h.toUpperCase().includes('CUSTOM'))

    const invMap = new Map() // zohoId -> cfsArray
    for (const row of records) {
      const zohoId = row['Invoice ID']
      if (!zohoId) continue

      if (!invMap.has(zohoId)) invMap.set(zohoId, [])
      const cfs = invMap.get(zohoId)

      for (const col of cfColumns) {
        const val = row[col]
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          let label = col.toUpperCase().startsWith('CF.') ? col.substring(3).trim() : col
          cfs.push({ label, value: String(val).trim() })
        }
      }
    }

    const entries = Array.from(invMap.entries()).filter(([_, cfs]) => cfs.length > 0)
    console.log(`Extracted custom fields for ${entries.length} invoices in ${invFile}. Syncing in batch transactions...`)

    const batchSize = 100
    let updatedCount = 0

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)

      const valuesSql = batch.map(([zohoId, cfs]) => {
        const jsonStr = JSON.stringify(cfs).replace(/'/g, "''")
        const idStr = zohoId.replace(/'/g, "''")
        return `('${idStr}', '${jsonStr}'::jsonb)`
      }).join(', ')

      const query = `
        UPDATE "Invoice" AS i 
        SET "items" = jsonb_set(COALESCE(i."items", '{}'::jsonb), '{custom_fields}', v.cfs) 
        FROM (VALUES ${valuesSql}) AS v(zoho_id, cfs) 
        WHERE i."zohoId" = v.zoho_id;
      `

      try {
        const res = await client.query(query)
        updatedCount += res.rowCount
      } catch (err) {
        console.error(`Error on batch ${i}:`, err.message)
      }

      if ((i + batchSize) % 1000 === 0 || i + batchSize >= entries.length) {
        console.log(`Synced ${Math.min(i + batchSize, entries.length)} / ${entries.length} invoices...`)
      }
    }

    totalUpdated += updatedCount
    console.log(`✅ Completed ${invFile}: ${updatedCount} invoices updated.`)
  }

  // 2. Quotes / Estimates Sync
  const quoteFiles = ['Quote00.csv', 'Quote01.csv']
  for (const qFile of quoteFiles) {
    const filePath = path.join(INPUT_DIR, qFile)
    if (!fs.existsSync(filePath)) continue

    console.log(`\nParsing ${qFile}...`)
    const content = fs.readFileSync(filePath, 'utf8')
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true })
    if (records.length === 0) continue

    const headers = Object.keys(records[0])
    const cfColumns = headers.filter(h => h.toUpperCase().startsWith('CF.'))

    const quoteMap = new Map()
    for (const row of records) {
      const zohoId = row['Estimate ID'] || row['Quote ID']
      if (!zohoId) continue

      if (!quoteMap.has(zohoId)) quoteMap.set(zohoId, [])
      const cfs = quoteMap.get(zohoId)

      for (const col of cfColumns) {
        const val = row[col]
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          let label = col.toUpperCase().startsWith('CF.') ? col.substring(3).trim() : col
          cfs.push({ label, value: String(val).trim() })
        }
      }
    }

    const entries = Array.from(quoteMap.entries()).filter(([_, cfs]) => cfs.length > 0)
    console.log(`Extracted custom fields for ${entries.length} quotes in ${qFile}. Syncing...`)

    let updatedCount = 0
    const batchSize = 100
    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      const valuesSql = batch.map(([zohoId, cfs]) => {
        const jsonStr = JSON.stringify(cfs).replace(/'/g, "''")
        const idStr = zohoId.replace(/'/g, "''")
        return `('${idStr}', '${jsonStr}'::jsonb)`
      }).join(', ')

      const query = `
        UPDATE "Quote" AS q 
        SET "items" = jsonb_set(COALESCE(q."items", '{}'::jsonb), '{custom_fields}', v.cfs) 
        FROM (VALUES ${valuesSql}) AS v(zoho_id, cfs) 
        WHERE q."zohoId" = v.zoho_id;
      `

      try {
        const res = await client.query(query)
        updatedCount += res.rowCount
      } catch (err) {}
    }
    console.log(`✅ Completed ${qFile}: ${updatedCount} quotes updated.`)
  }

  // Verify final DB custom field counts
  const invRes = await client.query(`SELECT COUNT(*) FROM "Invoice" WHERE "items"->'custom_fields' IS NOT NULL AND jsonb_array_length("items"->'custom_fields') > 0;`)
  const quoteRes = await client.query(`SELECT COUNT(*) FROM "Quote" WHERE "items"->'custom_fields' IS NOT NULL AND jsonb_array_length("items"->'custom_fields') > 0;`)

  console.log(`\n=== DIRECT PG SYNC COMPLETE ===`)
  console.log(`• Total Invoices with Custom Fields in DB: ${invRes.rows[0].count}`)
  console.log(`• Total Quotes with Custom Fields in DB: ${quoteRes.rows[0].count}`)

  await client.end()
}

pgFillCustomFields().catch(console.error)
