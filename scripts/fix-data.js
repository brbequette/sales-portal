// COMPLETE DATA FIX SCRIPT
const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function fixAll() {
  console.log('=== DATA FIX SCRIPT ===\n')

  // FIX 1: Status casing (already done, verify)
  console.log('--- FIX 1: Normalize status casing ---')
  const paidFix = await p.$queryRaw`UPDATE "Invoice" SET "status" = 'paid' WHERE "status" = 'Paid' RETURNING id`
  const voidFix = await p.$queryRaw`UPDATE "Invoice" SET "status" = 'void' WHERE "status" = 'Void' RETURNING id`
  console.log(`  Fixed ${paidFix.length} Paid→paid, ${voidFix.length} Void→void`)

  // FIX 2: Remove test user (test_migration_verification only — Titan has an account)
  console.log('\n--- FIX 2: Clean up test users ---')
  const testUser = await p.$queryRaw`SELECT id, name FROM "User" WHERE email = 'test_migration_verification@example.com'`
  if (testUser.length > 0) {
    const uid = testUser[0].id
    for (const [table, col] of [
      ['Notification','userId'],['PushSubscription','userId'],['TimeEntry','userId'],
      ['TimeChangeRequest','userId'],['Advance','userId'],['Reimbursement','userId'],
      ['Payout','repId'],['MonthlyVigGoal','repId'],['Note','authorId'],
      ['SmsMessage','authorId'],['CallLog','authorId'],['CampaignBlast','authorId'],
      ['CampaignJob','authorId'],['ScheduledMessage','authorId']
    ]) {
      try {
        await p.$queryRawUnsafe(`DELETE FROM "${table}" WHERE "${col}" = $1`, uid)
      } catch(e) { /* skip if table/col doesn't exist */ }
    }
    await p.$queryRaw`DELETE FROM "User" WHERE id = ${uid}`
    console.log(`  ✅ Deleted test_migration_verification`)
  } else {
    console.log(`  Already cleaned (not found)`)
  }

  // Reassign Titan's account to admin before deleting
  const titanUser = await p.$queryRaw`SELECT id FROM "User" WHERE email = 'titan@example.com'`
  if (titanUser.length > 0) {
    const adminUser = await p.$queryRaw`SELECT id FROM "User" WHERE role = 'Administrator' LIMIT 1`
    if (adminUser.length > 0) {
      const tid = titanUser[0].id
      const aid = adminUser[0].id
      await p.$queryRaw`UPDATE "Account" SET "ownerId" = ${aid} WHERE "ownerId" = ${tid}`
      for (const [table, col] of [
        ['Notification','userId'],['PushSubscription','userId'],['TimeEntry','userId'],
        ['TimeChangeRequest','userId'],['Advance','userId'],['Reimbursement','userId'],
        ['Payout','repId'],['MonthlyVigGoal','repId'],['Note','authorId'],
        ['SmsMessage','authorId'],['CallLog','authorId'],['CampaignBlast','authorId'],
        ['CampaignJob','authorId'],['ScheduledMessage','authorId'],['Deal','ownerId'],['Task','ownerId']
      ]) {
        try {
          await p.$queryRawUnsafe(`DELETE FROM "${table}" WHERE "${col}" = $1`, tid)
        } catch(e) { /* skip */ }
      }
      await p.$queryRaw`DELETE FROM "User" WHERE id = ${tid}`
      console.log(`  ✅ Reassigned Titan's account to admin, deleted Titan user`)
    }
  }

  // FIX 3: Populate computedSalesperson from rawData
  console.log('\n--- FIX 3: Backfill computedSalesperson ---')
  const invoices = await p.$queryRaw`
    SELECT id, "rawData" FROM "Invoice" 
    WHERE ("computedSalesperson" IS NULL OR "computedSalesperson" = '')
    AND "rawData" IS NOT NULL`
  
  let spUpdated = 0, spNotFound = 0
  const repCounts = {}

  for (const inv of invoices) {
    let sp = null
    try {
      const raw = typeof inv.rawData === 'string' ? JSON.parse(inv.rawData) : inv.rawData
      sp = raw.salesperson_name || raw.salesperson || null
      if (!sp && raw.custom_fields && Array.isArray(raw.custom_fields)) {
        const f = raw.custom_fields.find(f => (f.label||'').toLowerCase().includes('salesperson') || (f.label||'').toLowerCase().includes('sales rep'))
        if (f) sp = f.value
      }
    } catch(e) {}
    if (sp && sp.trim()) {
      await p.$queryRaw`UPDATE "Invoice" SET "computedSalesperson" = ${sp.trim()} WHERE id = ${inv.id}`
      spUpdated++
      repCounts[sp.trim()] = (repCounts[sp.trim()] || 0) + 1
    } else { spNotFound++ }
  }
  console.log(`  Updated: ${spUpdated.toLocaleString()}`)
  console.log(`  No salesperson in rawData: ${spNotFound.toLocaleString()}`)
  Object.entries(repCounts).sort((a,b) => b[1]-a[1]).forEach(([n,c]) => console.log(`    ${n.padEnd(30)} ${c}`))

  // FIX 4: Backfill computedInvoiceNumber
  console.log('\n--- FIX 4: Backfill computedInvoiceNumber ---')
  const noNum = await p.$queryRaw`
    SELECT id, "rawData" FROM "Invoice" 
    WHERE ("computedInvoiceNumber" IS NULL OR "computedInvoiceNumber" = '')
    AND "rawData" IS NOT NULL`
  let numUpdated = 0
  for (const inv of noNum) {
    try {
      const raw = typeof inv.rawData === 'string' ? JSON.parse(inv.rawData) : inv.rawData
      const num = raw.invoice_number || raw.number || null
      if (num) {
        await p.$queryRaw`UPDATE "Invoice" SET "computedInvoiceNumber" = ${String(num)} WHERE id = ${inv.id}`
        numUpdated++
      }
    } catch(e) {}
  }
  console.log(`  Updated: ${numUpdated.toLocaleString()} invoices`)

  // FIX 5: Backfill computedFinal
  console.log('\n--- FIX 5: Backfill computedFinal ---')
  const noFinal = await p.$queryRaw`
    SELECT id, "rawData", "amount" FROM "Invoice" WHERE "computedFinal" IS NULL AND "rawData" IS NOT NULL`
  let finalUpdated = 0
  for (const inv of noFinal) {
    try {
      const raw = typeof inv.rawData === 'string' ? JSON.parse(inv.rawData) : inv.rawData
      const total = raw.total || inv.amount || null
      if (total !== null) {
        await p.$queryRaw`UPDATE "Invoice" SET "computedFinal" = ${String(total)} WHERE id = ${inv.id}`
        finalUpdated++
      }
    } catch(e) {}
  }
  console.log(`  Updated: ${finalUpdated.toLocaleString()} invoices`)

  // FIX 6: Link orphan payments
  console.log('\n--- FIX 6: Link orphan payments to invoices ---')
  const orphans = await p.$queryRaw`
    SELECT p.id as pid, p."invoiceId" as zoho_inv_id, p."invoiceNumber", p.amount
    FROM "Payment" p
    WHERE p."invoiceDbId" IS NULL
    AND p."invoiceId" IS NOT NULL AND p."invoiceId" != ''`
  
  let linked = 0, noMatch = 0
  for (const pay of orphans) {
    // Match Payment.invoiceId (Zoho invoice ID) → Invoice.zohoId
    const match = await p.$queryRaw`SELECT id FROM "Invoice" WHERE "zohoId" = ${pay.zoho_inv_id} LIMIT 1`
    if (match.length > 0) {
      await p.$queryRaw`UPDATE "Payment" SET "invoiceDbId" = ${match[0].id} WHERE id = ${pay.pid}`
      linked++
    } else { noMatch++ }
  }
  console.log(`  Linked: ${linked.toLocaleString()} payments to invoices`)
  console.log(`  No matching invoice: ${noMatch.toLocaleString()}`)

  // Check remaining orphans (with no invoiceId at all)
  const stillOrphan = await p.$queryRaw`
    SELECT COUNT(*) as cnt FROM "Payment" WHERE "invoiceDbId" IS NULL`
  console.log(`  Remaining orphans: ${Number(stillOrphan[0].cnt).toLocaleString()}`)

  // FIX 7: Backfill computedVigRate
  console.log('\n--- FIX 7: Backfill computedVigRate ---')
  const noVig = await p.$queryRaw`
    SELECT id, "rawData" FROM "Invoice" WHERE "computedVigRate" IS NULL AND "rawData" IS NOT NULL`
  let vigUpdated = 0
  for (const inv of noVig) {
    try {
      const raw = typeof inv.rawData === 'string' ? JSON.parse(inv.rawData) : inv.rawData
      if (raw.custom_fields && Array.isArray(raw.custom_fields)) {
        const f = raw.custom_fields.find(f => (f.label||'').toLowerCase().includes('vig') || (f.label||'').toLowerCase().includes('commission'))
        if (f && f.value !== '' && f.value !== null) {
          await p.$queryRaw`UPDATE "Invoice" SET "computedVigRate" = ${String(f.value)} WHERE id = ${inv.id}`
          vigUpdated++
        }
      }
    } catch(e) {}
  }
  console.log(`  Updated: ${vigUpdated.toLocaleString()} invoices`)

  console.log('\n=== ALL FIXES COMPLETE ===')
}

fixAll().catch(e => { console.error('FIX FAILED:', e.message, e.stack); process.exit(1) }).finally(() => p.$disconnect())
