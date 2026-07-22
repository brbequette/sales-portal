const fs = require('fs')
const path = require('path')
const { parse } = require('csv-parse/sync')
const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()
const INPUT_DIR = 'C:/Users/titan/Documents/Titan Diamond/invoices'

async function fillAllCustomFields() {
  console.log("=== FILLING ALL CUSTOM FIELDS ACROSS ALL DOCUMENTS & ENTITIES ===")

  // 1. Process Invoices (Invoice00.csv & Invoice01.csv)
  const invoiceFiles = ['Invoice00.csv', 'Invoice01.csv']
  for (const invFile of invoiceFiles) {
    const filePath = path.join(INPUT_DIR, invFile)
    if (!fs.existsSync(filePath)) continue

    console.log(`\nParsing custom fields from ${invFile}...`)
    const content = fs.readFileSync(filePath, 'utf8')
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true })

    if (records.length === 0) continue

    // Find all CF columns
    const headers = Object.keys(records[0])
    const cfColumns = headers.filter(h => h.toUpperCase().startsWith('CF.') || h.toUpperCase().includes('CUSTOM'))

    console.log(`Found ${cfColumns.length} custom field columns in ${invFile}:`, cfColumns.join(', '))

    const invMap = new Map() // zohoId -> customFieldsObj
    for (const row of records) {
      const zohoId = row['Invoice ID']
      if (!zohoId) continue

      if (!invMap.has(zohoId)) {
        invMap.set(zohoId, new Map())
      }

      const cfMap = invMap.get(zohoId)
      for (const col of cfColumns) {
        const val = row[col]
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          // Standardize label name (strip "CF." prefix if present)
          let label = col
          if (label.toUpperCase().startsWith('CF.')) {
            label = label.substring(3).trim()
          }
          cfMap.set(label, String(val).trim())
        }
      }
    }

    console.log(`Found custom fields for ${invMap.size} invoices. Loading invoices in chunks...`)
    const allInvoices = []
    let skip = 0
    while (true) {
      try {
        const chunk = await prisma.invoice.findMany({
          select: { id: true, zohoId: true, items: true },
          take: 1000,
          skip
        })
        if (chunk.length === 0) break
        allInvoices.push(...chunk)
        skip += chunk.length
      } catch (e) {
        console.log(`Retry fetching chunk at skip ${skip}...`)
        await new Promise(res => setTimeout(res, 1000))
      }
    }
    console.log(`Loaded ${allInvoices.length} total invoices into memory.`)

    const dbInvMap = new Map()
    for (const inv of allInvoices) {
      if (inv.zohoId) dbInvMap.set(inv.zohoId, inv)
    }

    let updatedInvoices = 0
    const ops = []

    for (const [zohoId, cfMap] of invMap.entries()) {
      if (cfMap.size === 0) continue
      const dbInv = dbInvMap.get(zohoId)
      if (!dbInv) continue

      let items = dbInv.items || {}
      let existingCFs = items.custom_fields || []
      let changed = false

      for (const [label, value] of cfMap.entries()) {
        const normLabel = label.toUpperCase()
        const found = existingCFs.find(c => (c.label || '').toUpperCase() === normLabel)
        if (found) {
          if (!found.value || found.value === '') {
            found.value = value
            changed = true
          }
        } else {
          existingCFs.push({ label, value })
          changed = true
        }
      }

      if (changed) {
        items.custom_fields = existingCFs
        ops.push(prisma.invoice.update({
          where: { zohoId },
          data: { items }
        }))
        updatedInvoices++
      }
    }

    console.log(`Executing ${ops.length} batch updates for ${invFile}...`)
    for (let i = 0; i < ops.length; i += 50) {
      const batch = ops.slice(i, i + 50)
      for (let r = 0; r < 3; r++) {
        try {
          await prisma.$transaction(batch)
          break
        } catch (e) {
          await new Promise(res => setTimeout(res, 1000 * (r + 1)))
        }
      }
      if (i > 0 && i % 500 === 0) console.log(`Updated ${i} / ${ops.length}...`)
    }
    console.log(`✅ Filled custom fields for ${updatedInvoices} invoices in ${invFile}.`)
  }

  // 2. Process Quotes (Quote00.csv & Quote01.csv)
  const quoteFiles = ['Quote00.csv', 'Quote01.csv']
  for (const qFile of quoteFiles) {
    const filePath = path.join(INPUT_DIR, qFile)
    if (!fs.existsSync(filePath)) continue

    console.log(`\nParsing custom fields from ${qFile}...`)
    const content = fs.readFileSync(filePath, 'utf8')
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true })

    if (records.length === 0) continue

    const headers = Object.keys(records[0])
    const cfColumns = headers.filter(h => h.toUpperCase().startsWith('CF.'))

    const quoteMap = new Map()
    for (const row of records) {
      const zohoId = row['Estimate ID'] || row['Quote ID']
      if (!zohoId) continue

      if (!quoteMap.has(zohoId)) quoteMap.set(zohoId, new Map())
      const cfMap = quoteMap.get(zohoId)

      for (const col of cfColumns) {
        const val = row[col]
        if (val !== undefined && val !== null && String(val).trim() !== '') {
          let label = col.toUpperCase().startsWith('CF.') ? col.substring(3).trim() : col
          cfMap.set(label, String(val).trim())
        }
      }
    }

    console.log(`Found custom fields for ${quoteMap.size} quotes. Merging...`)
    let updatedQuotes = 0
    for (const [zohoId, cfMap] of quoteMap.entries()) {
      if (cfMap.size === 0) continue
      try {
        const dbQuote = await prisma.quote.findUnique({ where: { zohoId } })
        if (!dbQuote) continue

        let items = dbQuote.items || {}
        let existingCFs = items.custom_fields || []
        let changed = false

        for (const [label, value] of cfMap.entries()) {
          const normLabel = label.toUpperCase()
          const found = existingCFs.find(c => (c.label || '').toUpperCase() === normLabel)
          if (found) {
            if (!found.value || found.value === '') {
              found.value = value
              changed = true
            }
          } else {
            existingCFs.push({ label, value })
            changed = true
          }
        }

        if (changed) {
          items.custom_fields = existingCFs
          await prisma.quote.update({
            where: { zohoId },
            data: { items }
          })
          updatedQuotes++
        }
      } catch (e) {}
    }
    console.log(`✅ Filled custom fields for ${updatedQuotes} quotes in ${qFile}.`)
  }

  // 3. Process Vendors (Vendors (4).csv)
  const vendorFile = path.join(INPUT_DIR, 'Vendors (4).csv')
  if (fs.existsSync(vendorFile)) {
    console.log(`\nParsing custom fields from ${path.basename(vendorFile)}...`)
    const content = fs.readFileSync(vendorFile, 'utf8')
    const records = parse(content, { columns: true, skip_empty_lines: true, relax_quotes: true })

    if (records.length > 0) {
      const headers = Object.keys(records[0])
      const cfColumns = headers.filter(h => h.toUpperCase().startsWith('CF.'))

      let updatedVendors = 0
      for (const row of records) {
        const zohoId = row['Vendor ID']
        if (!zohoId) continue

        const cfs = []
        for (const col of cfColumns) {
          const val = row[col]
          if (val !== undefined && val !== null && String(val).trim() !== '') {
            let label = col.toUpperCase().startsWith('CF.') ? col.substring(3).trim() : col
            cfs.push({ label, value: String(val).trim() })
          }
        }

        if (cfs.length > 0) {
          try {
            await prisma.vendor.upsert({
              where: { zohoId },
              update: {
                contactName: row['Vendor Name'] || row['Display Name'],
                companyName: row['Company Name'],
                email: row['Email'],
                phone: row['Phone'],
                customFields: cfs
              },
              create: {
                zohoId,
                contactName: row['Vendor Name'] || row['Display Name'],
                companyName: row['Company Name'],
                email: row['Email'],
                phone: row['Phone'],
                customFields: cfs
              }
            })
            updatedVendors++
          } catch (e) {}
        }
      }
      console.log(`✅ Updated ${updatedVendors} Vendors with custom fields.`)
    }
  }

  console.log("\n=== ALL CUSTOM FIELDS BACKFILL COMPLETE ===")
}

fillAllCustomFields()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
