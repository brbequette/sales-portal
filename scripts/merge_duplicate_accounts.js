const { Client } = require('pg')
const connectionString = process.env.DATABASE_URL

async function mergeDuplicateAccounts() {
  const client = new Client({ connectionString })
  await client.connect()

  console.log("======================================================")
  console.log("   AUTOMATED ACCOUNT MERGE & DEDUPLICATION ENGINE     ")
  console.log("======================================================\n")

  // Find all account groups with >1 account sharing the same normalized name
  const res = await client.query(`
    SELECT LOWER(TRIM("name")) as clean_name, COUNT(*) as count, ARRAY_AGG("id") as ids
    FROM "Account" 
    GROUP BY LOWER(TRIM("name")) 
    HAVING COUNT(*) > 1;
  `)

  console.log(`Found ${res.rows.length} duplicate account groups to merge...\n`)

  let totalMerged = 0
  let totalRelinkedDeals = 0

  for (const group of res.rows) {
    const ids = group.ids
    console.log(`📦 Merging group: "${group.clean_name}" (${ids.length} accounts: ${ids.join(', ')})`)

    // Fetch full records for all accounts in this group
    const accountsRes = await client.query(`
      SELECT "id", "zohoId", "name", "ownerId", "status", "quality", "lastPurchaseAt", "createdAt"
      FROM "Account"
      WHERE "id" = ANY($1::text[]);
    `, [ids])

    const accounts = accountsRes.rows

    // Sort to find the Master Account:
    // 1. Prefer account with lastPurchaseAt
    // 2. Prefer account whose zohoId starts with "125436" (Zoho Books primary ID)
    // 3. Earliest createdAt
    accounts.sort((a, b) => {
      if (a.lastPurchaseAt && !b.lastPurchaseAt) return -1
      if (!a.lastPurchaseAt && b.lastPurchaseAt) return 1
      if (a.zohoId.startsWith('125436') && !b.zohoId.startsWith('125436')) return -1
      if (!a.zohoId.startsWith('125436') && b.zohoId.startsWith('125436')) return 1
      return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    })

    const master = accounts[0]
    const duplicateIds = accounts.slice(1).map(a => a.id)
    const duplicateZohoIds = accounts.slice(1).map(a => a.zohoId)

    console.log(`   👑 Master Account: ID=${master.id} | ZohoID=${master.zohoId} | Owner=${master.ownerId}`)
    console.log(`   🗑️ Duplicates to remove (${duplicateIds.length}): ${duplicateIds.join(', ')}`)

    // Re-link Deals
    const relinkDeals = await client.query(`
      UPDATE "Deal" SET "accountId" = $1 WHERE "accountId" = ANY($2::text[]);
    `, [master.id, duplicateIds])
    if (relinkDeals.rowCount > 0) console.log(`      -> Re-linked ${relinkDeals.rowCount} deals to master`)

    // Re-link Invoices
    const relinkInvoices = await client.query(`
      UPDATE "Invoice" SET "accountId" = $1 WHERE "accountId" = ANY($2::text[]);
    `, [master.id, duplicateIds])
    if (relinkInvoices.rowCount > 0) console.log(`      -> Re-linked ${relinkInvoices.rowCount} invoices to master`)

    // Re-link Quotes
    const relinkQuotes = await client.query(`
      UPDATE "Quote" SET "accountId" = $1 WHERE "accountId" = ANY($2::text[]);
    `, [master.id, duplicateIds])
    if (relinkQuotes.rowCount > 0) console.log(`      -> Re-linked ${relinkQuotes.rowCount} quotes to master`)

    // Re-link SalesOrders
    const relinkOrders = await client.query(`
      UPDATE "SalesOrder" SET "accountId" = $1 WHERE "accountId" = ANY($2::text[]);
    `, [master.id, duplicateIds])
    if (relinkOrders.rowCount > 0) console.log(`      -> Re-linked ${relinkOrders.rowCount} sales orders to master`)

    // Re-link Notes
    const relinkNotes = await client.query(`
      UPDATE "Note" SET "accountId" = $1 WHERE "accountId" = ANY($2::text[]);
    `, [master.id, duplicateIds])
    if (relinkNotes.rowCount > 0) console.log(`      -> Re-linked ${relinkNotes.rowCount} notes to master`)

    // Re-link Tasks
    const relinkTasks = await client.query(`
      UPDATE "Task" SET "accountId" = $1 WHERE "accountId" = ANY($2::text[]);
    `, [master.id, duplicateIds])
    if (relinkTasks.rowCount > 0) console.log(`      -> Re-linked ${relinkTasks.rowCount} tasks to master`)

    // Re-link Contact records
    const contactRes = await client.query(`
      UPDATE "Contact"
      SET "accountId" = $1
      WHERE "accountId" = ANY($2::text[])
      RETURNING "id";
    `, [master.id, duplicateIds])
    if (contactRes.rows.length > 0) {
      console.log(`       -> Re-linked ${contactRes.rows.length} contacts to master`)
    }

    // Delete redundant duplicate accounts
    const deleteRes = await client.query(`
      DELETE FROM "Account" WHERE "id" = ANY($1::text[]);
    `, [duplicateIds])

    totalMerged += deleteRes.rowCount
    console.log(`   ✅ Cleaned up ${deleteRes.rowCount} duplicate account records.\n`)
  }

  console.log("======================================================")
  console.log(`🎉 COMPLETED! Successfully merged & removed ${totalMerged} duplicate accounts.`)
  console.log("======================================================")

  await client.end()
}

mergeDuplicateAccounts().catch(console.error)
