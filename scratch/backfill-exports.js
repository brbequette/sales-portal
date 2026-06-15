const fs = require("fs")
const { parse } = require("csv-parse/sync")
const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  console.log("Starting backfill...")

  // Load all users
  const users = await prisma.user.findMany()
  const userMap = new Map() // By lowercase name and zohoId
  users.forEach(u => {
    if (u.name) userMap.set(u.name.toLowerCase().trim(), u.id)
    if (u.zohoId) userMap.set(u.zohoId, u.id)
  })

  // We will read Deals first to create Accounts, Deals, and extract CRM owners
  const dealsPath = "C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/Deals_2026_06_12.csv"
  let dealsCsv = ""
  try {
    dealsCsv = fs.readFileSync(dealsPath, "utf8")
  } catch(e) {
    console.error("Could not read Deals CSV:", e.message)
    process.exit(1)
  }

  const dealsRecords = parse(dealsCsv, {
    columns: true,
    skip_empty_lines: true,
    relax_quotes: true,
    relax_column_count: true
  })

  console.log(`Parsed ${dealsRecords.length} deals. Deduplicating...`)
  const uniqueDealsMap = new Map()
  for (const row of dealsRecords) {
    if (row["Record Id"]) uniqueDealsMap.set(row["Record Id"], row)
  }
  const uniqueDeals = Array.from(uniqueDealsMap.values())

  let countAcc = 0
  let countDeal = 0

  // Batch execution function
  async function processInBatches(items, batchSize, processItem) {
    for (let i = 0; i < items.length; i += batchSize) {
      const batch = items.slice(i, i + batchSize)
      await Promise.all(batch.map(processItem))
      console.log(`Processed ${Math.min(i + batchSize, items.length)} / ${items.length}`)
    }
  }

  await processInBatches(uniqueDeals, 50, async (row) => {
    const accZohoId = row["Account Name.id"]
    const accName = row["Account Name"]
    const dealZohoId = row["Record Id"]
    const dealName = row["Deal Name"]
    let dealOwnerName = row["Deal Owner"]
    const dealOwnerZohoId = row["Deal Owner.id"]
    
    if (!accZohoId || !dealZohoId) return

    // Map owner
    let ownerId = userMap.get(dealOwnerZohoId) || userMap.get((dealOwnerName || "").toLowerCase().trim())
    if (!ownerId) {
      const admin = users.find(u => u.email === "brbequette@gmail.com" || u.email === "ben@titandiamond.net")
      ownerId = admin ? admin.id : users[0].id
    }

    // Upsert Account
    const dbAccount = await prisma.account.upsert({
      where: { zohoId: accZohoId },
      update: { name: accName },
      create: {
        zohoId: accZohoId,
        name: accName,
        ownerId: ownerId,
        status: "Update Status"
      }
    })
    countAcc++

    // Upsert Deal
    const closingDate = row["Closing Date"] ? new Date(row["Closing Date"]) : null
    await prisma.deal.upsert({
      where: { zohoId: dealZohoId },
      update: {
        name: dealName,
        amount: parseFloat(row["Amount"]) || 0,
        stage: row["Stage"] || "Open",
        closingDate: closingDate,
        ownerId: ownerId,
        invoicedItems: row["Invoiced Items"] || null
      },
      create: {
        zohoId: dealZohoId,
        accountId: dbAccount.id,
        name: dealName,
        amount: parseFloat(row["Amount"]) || 0,
        stage: row["Stage"] || "Open",
        closingDate: closingDate,
        ownerId: ownerId,
        invoicedItems: row["Invoiced Items"] || null
      }
    })
    countDeal++
  })

  console.log(`Processed ${countAcc} Accounts and ${countDeal} Deals.`)

  // Next, parse Invoice00 and Invoice01
  const processInvoices = async (filename) => {
    const path = `C:/Users/titan/Documents/Titan Diamond/AUTOMATIONS/exports/${filename}`
    if (!fs.existsSync(path)) return
    
    console.log(`Processing ${filename}...`)
    const csvStr = fs.readFileSync(path, "utf8")
    const records = parse(csvStr, { columns: true, skip_empty_lines: true, relax_quotes: true, relax_column_count: true })

    // PRE-CREATE MISSING ACCOUNTS TO AVOID RACE CONDITIONS
    console.log(`Pre-creating missing accounts for ${filename}...`)
    const missingAccountsMap = new Map()
    for (const row of records) {
      const accZohoId = row["Customer ID"]
      if (accZohoId && !missingAccountsMap.has(accZohoId)) {
        let salespersonName = row["Sales person"] || row["CF.SALESPERSON VIG"] || ""
        let ownerId = userMap.get(salespersonName.toLowerCase().trim())
        if (!ownerId) {
            const admin = users.find(u => u.email === "ben@titandiamond.net")
            ownerId = admin ? admin.id : users[0].id
        }
        missingAccountsMap.set(accZohoId, {
            zohoId: accZohoId,
            name: row["Customer Name"] || "Unknown Account",
            ownerId: ownerId,
            status: "Update Status"
        })
      }
    }
    
    const missingAccountsArray = Array.from(missingAccountsMap.values())
    await processInBatches(missingAccountsArray, 50, async (acc) => {
        await prisma.account.upsert({
            where: { zohoId: acc.zohoId },
            update: {},
            create: acc
        }).catch(() => {}) // ignore race conditions if any
    })
    
    // Build quick lookup for account IDs
    const dbAccounts = await prisma.account.findMany({ select: { id: true, zohoId: true, ownerId: true } })
    const accZohoToIdMap = new Map()
    const accZohoToOwnerMap = new Map()
    dbAccounts.forEach(a => {
        accZohoToIdMap.set(a.zohoId, a.id)
        accZohoToOwnerMap.set(a.zohoId, a.ownerId)
    })

    console.log(`Deduplicating invoices...`)
    const uniqueInvoicesMap = new Map()
    for (const row of records) {
      if (row["Invoice ID"]) {
          uniqueInvoicesMap.set(row["Invoice ID"], row)
      }
    }
    const uniqueInvoices = Array.from(uniqueInvoicesMap.values())

    let invCount = 0
    await processInBatches(uniqueInvoices, 50, async (row) => {
      const invZohoId = row["Invoice ID"]
      const invNum = row["Invoice Number"]
      const accZohoId = row["Customer ID"]
      const status = row["Invoice Status"] || "Draft"

      if (!invZohoId || !accZohoId) return

      let salespersonName = row["Sales person"] || row["CF.SALESPERSON VIG"] || ""
      let ownerId = userMap.get(salespersonName.toLowerCase().trim())
      
      let dbAccountId = accZohoToIdMap.get(accZohoId) || accZohoId
      
      if (!ownerId) {
          ownerId = accZohoToOwnerMap.get(accZohoId)
      }

      if (!ownerId) {
        const admin = users.find(u => u.email === "ben@titandiamond.net")
        ownerId = admin ? admin.id : users[0].id
      }

      const dueDate = row["Due Date"] ? new Date(row["Due Date"]) : null
      const issueDateStr = row["Issued Date"] || row["Invoice Date"]
      const issueDate = issueDateStr ? new Date(issueDateStr) : (dueDate || new Date())
      const amount = parseFloat(row["Total"]) || 0

      // We store the data in items JSON
      const itemsData = {
        invoiceNumber: invNum,
        salesperson: salespersonName,
        profit: parseFloat(row["CF.PROFIT"]) || 0,
        deadCostTotal: parseFloat(row["CF.DEAD COST TOTAL"]) || 0,
        commissionAmount: parseFloat(row["CF.SALES COMMISSION"]) || 0,
      }

      await prisma.invoice.upsert({
        where: { zohoId: invZohoId },
        update: {
          accountId: dbAccountId,
          amount,
          status,
          dueDate,
          issueDate,
          items: itemsData
        },
        create: {
          zohoId: invZohoId,
          amount,
          status,
          dueDate,
          issueDate,
          items: itemsData,
          account: { connect: { id: dbAccountId } }
        }
      })
      invCount++
    })
    console.log(`Finished processing ${invCount} invoices from ${filename}.`)
  }

  await processInvoices("Invoice00.csv")
  await processInvoices("Invoice01.csv")

  // --- Commission Alignment ---
  console.log("Aligning commissions up to Dec 2024...")
  const cutoffDate = new Date("2024-12-31T23:59:59.999Z")

  for (const rep of users) {
    // Sum up all won deals before 2025
    const repDeals = await prisma.deal.findMany({
      where: {
        ownerId: rep.id,
        closingDate: { lte: cutoffDate },
      }
    })

    let totalEarned = 0
    for (const d of repDeals) {
      const stage = (d.stage || "").toLowerCase()
      const isClosed = stage.includes("closed won") || stage.includes("fulfilled") || stage.includes("paid")
      if (isClosed) {
        // Commission is 10% of profit. Try to find matched invoice for profit, or default to 10% of deal amount
        let profit = 0
        const parts = d.name.split('|')
        let docNum = parts.length >= 2 ? parts[1].trim().replace('EST-', '').replace('SO-', '') : null
        
        if (docNum) {
           const invMatch = await prisma.invoice.findFirst({
             where: { 
               OR: [
                 { items: { path: ['invoiceNumber'], equals: docNum } },
                 { zohoId: { endsWith: docNum } }
               ]
             }
           })
           if (invMatch) {
             const items = invMatch.items
             profit = parseFloat(items.profit) || 0
           }
        }
        
        const baseValue = profit > 0 ? profit : d.amount
        totalEarned += baseValue * 0.10
      }
    }

    if (totalEarned > 0) {
      console.log(`Rep ${rep.name} earned $${totalEarned.toFixed(2)} up to 2024-12-31. Creating Payout record...`)
      await prisma.payout.create({
        data: {
          repId: rep.id,
          amount: totalEarned,
          date: new Date("2024-12-31T12:00:00.000Z"),
          notes: "Backfill Payout: Settling all commissions earned up to Dec 2024."
        }
      })
    }
  }

  console.log("Backfill complete!")
}

main().catch(console.error).finally(() => prisma.$disconnect())
