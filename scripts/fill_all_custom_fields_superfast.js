const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { PrismaClient } = require('@prisma/client')

const dbUrl = "postgresql://netlifydb_owner:npg_jvz7JFbSoEH6@ep-fragrant-salad-aj44trez.c-3.us-east-2.db.netlify.com/netlifydb?sslmode=require&connect_timeout=60"
const prisma = new PrismaClient({
  datasources: {
    db: { url: dbUrl }
  }
})
const INPUT_DIR = 'C:/Users/titan/Documents/Titan Diamond/invoices'

async function superFastFillCustomFields() {
  console.log("=== SUPERFAST BATCH RAW SQL CUSTOM FIELDS BACKFILL ===")

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
    console.log(`Extracted custom fields for ${entries.length} invoices in ${invFile}. Batching SQL updates...`)

    const batchSize = 250
    let updatedCount = 0

    for (let i = 0; i < entries.length; i += batchSize) {
      const batch = entries.slice(i, i + batchSize)
      
      // Escape values for SQL
      const valuesSql = batch.map(([zohoId, cfs]) => {
        const jsonStr = JSON.stringify(cfs).replace(/'/g, "''")
        const idStr = zohoId.replace(/'/g, "''")
        return `('${idStr}', '${jsonStr}')`
      }).join(', ')

      const query = `
        UPDATE "Invoice" AS i 
        SET "items" = jsonb_set(COALESCE(i."items", '{}'::jsonb), '{custom_fields}', v.cfs::jsonb) 
        FROM (VALUES ${valuesSql}) AS v(zoho_id, cfs) 
        WHERE i."zohoId" = v.zoho_id;
      `

      for (let attempt = 0; attempt < 3; attempt++) {
        try {
          await prisma.$executeRawUnsafe(query)
          updatedCount += batch.length
          break
        } catch (err) {
          console.log(`Retry batch ${i}... (${err.message || err})`)
          await new Promise(r => setTimeout(r, 1000))
        }
      }

      console.log(`Updated ${Math.min(i + batchSize, entries.length)} / ${entries.length} invoices...`)
    }

    totalUpdated += updatedCount
    console.log(`✅ Completed ${invFile}: ${updatedCount} invoices updated.`)
  }

  console.log(`\n=== SUPERFAST CUSTOM FIELDS BACKFILL FINISHED: ${totalUpdated} TOTAL RECORDS COMPLETED ===`)
}

superFastFillCustomFields()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
