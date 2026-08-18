const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const INPUT_DIR = 'C:/Users/titan/Documents/Titan Diamond/invoices'

async function fastFillCustomFields() {
  console.log("=== FAST PARALLEL CUSTOM FIELDS BACKFILL VIA RAW SQL ===")

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

    const invMap = new Map() // zohoId -> array of {label, value}
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

    console.log(`Extracted custom fields for ${invMap.size} invoices in ${invFile}. Syncing to DB...`)

    let fileUpdated = 0
    const entries = Array.from(invMap.entries())

    for (let i = 0; i < entries.length; i++) {
      const [zohoId, newCFs] = entries[i]
      if (newCFs.length === 0) continue

      const cfJson = JSON.stringify(newCFs)

      // Execute SQL update: append or set custom_fields in items JSONB
      try {
        await prisma.$executeRawUnsafe(
          `UPDATE "Invoice" 
           SET "items" = jsonb_set(
             COALESCE("items", '{}'::jsonb), 
             '{custom_fields}', 
             $1::jsonb
           ) 
           WHERE "zohoId" = $2;`,
          cfJson,
          zohoId
        )
        fileUpdated++
      } catch (err) {
        // Continue on individual row timeout/retry
      }

      if ((i + 1) % 500 === 0 || i + 1 === entries.length) {
        console.log(`Synced ${i + 1} / ${entries.length} invoices (${fileUpdated} updated)...`)
      }
    }

    totalUpdated += fileUpdated
    console.log(`✅ Completed ${invFile}: ${fileUpdated} invoices synced.`)
  }

  console.log(`\n=== FAST CUSTOM FIELDS BACKFILL COMPLETE: ${totalUpdated} TOTAL RECORDS SYNCED ===`)
}

fastFillCustomFields()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
