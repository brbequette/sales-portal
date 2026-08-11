const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function audit() {
  console.log('=== TITAN DIAMOND DATA AUDIT ===\n')
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // 1. TABLE ROW COUNTS
  console.log('--- TABLE ROW COUNTS ---')
  const tables = ['User','Account','Invoice','SalesOrder','Quote','Payment','Contact','Product','Task','Note','Notification','Deal','Payout','MonthlyVigGoal','TimeEntry','LineItem']
  for (const t of tables) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${t}"`)
      console.log(`  ${t.padEnd(22)} ${Number(result[0].cnt).toLocaleString()} rows`)
    } catch (e) {
      console.log(`  ${t.padEnd(22)} TABLE NOT FOUND`)
    }
  }

  // 2. ZOHO ID COVERAGE
  console.log('\n--- ZOHO ID COVERAGE ---')
  const zohoChecks = [
    { table: 'Invoice', col: 'zohoId' },
    { table: 'Account', col: 'zohoId' },
    { table: 'Contact', col: 'zohoId' },
    { table: 'Product', col: 'zohoItemId' },
    { table: 'SalesOrder', col: 'zohoId' },
    { table: 'Quote', col: 'zohoId' },
    { table: 'Payment', col: 'zohoId' },
    { table: 'Deal', col: 'zohoId' },
  ]
  for (const { table, col } of zohoChecks) {
    try {
      const total = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${table}"`)
      const withId = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${table}" WHERE "${col}" IS NOT NULL AND "${col}" != ''`)
      const without = Number(total[0].cnt) - Number(withId[0].cnt)
      const pct = Number(total[0].cnt) > 0 ? ((Number(withId[0].cnt) / Number(total[0].cnt)) * 100).toFixed(1) : '0'
      console.log(`  ${table.padEnd(15)} ${Number(withId[0].cnt).toLocaleString()}/${Number(total[0].cnt).toLocaleString()} have ${col} (${pct}%) ${without > 0 ? `⚠️ ${without} missing` : '✅'}`)
    } catch (e) {
      console.log(`  ${table.padEnd(15)} SKIP (no ${col} column or table missing)`)
    }
  }

  // 3. DUPLICATE ZOHO IDS
  console.log('\n--- DUPLICATE ZOHO IDS ---')
  for (const table of ['Invoice','Account','Contact','SalesOrder','Quote']) {
    try {
      const dups = await prisma.$queryRawUnsafe(`
        SELECT "zohoId", COUNT(*) as cnt 
        FROM "${table}" 
        WHERE "zohoId" IS NOT NULL AND "zohoId" != ''
        GROUP BY "zohoId" 
        HAVING COUNT(*) > 1 
        LIMIT 5`)
      console.log(`  ${table.padEnd(15)} ${dups.length} duplicates ${dups.length > 0 ? '⚠️' : '✅'}`)
      dups.forEach(d => console.log(`    zohoId=${d.zohoId} count=${d.cnt}`))
    } catch (e) {
      console.log(`  ${table.padEnd(15)} SKIP`)
    }
  }

  // 4. ORPHANED RECORDS
  console.log('\n--- ORPHANED RECORDS ---')
  try {
    const invNoAcct = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "accountId" IS NULL`
    console.log(`  Invoices with no Account:   ${Number(invNoAcct[0].cnt)} ${Number(invNoAcct[0].cnt) > 10 ? '⚠️' : '✅'}`)
  } catch(e) {}
  try {
    const payNoInv = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM "Payment" WHERE "invoiceDbId" IS NULL`
    console.log(`  Payments with no Invoice:   ${Number(payNoInv[0].cnt)} ${Number(payNoInv[0].cnt) > 0 ? '⚠️' : '✅'}`)
  } catch(e) {}
  try {
    const soNoAcct = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM "SalesOrder" WHERE "accountId" IS NULL`
    console.log(`  SalesOrders with no Account: ${Number(soNoAcct[0].cnt)} ${Number(soNoAcct[0].cnt) > 0 ? '⚠️' : '✅'}`)
  } catch(e) {}

  // 5. DATA FRESHNESS
  console.log('\n--- DATA FRESHNESS ---')
  const now = new Date()
  const hoursAgo = (d) => d ? ((now - new Date(d)) / (1000 * 60 * 60)).toFixed(1) : 'N/A'
  
  for (const table of ['Invoice','Account','Contact','Product','Payment','SalesOrder','Quote']) {
    try {
      const latest = await prisma.$queryRawUnsafe(`SELECT MAX("updatedAt") as latest FROM "${table}"`)
      const ts = latest[0].latest
      console.log(`  ${table.padEnd(15)} Last updated: ${ts ? new Date(ts).toISOString() : 'NEVER'}  (${hoursAgo(ts)}h ago)`)
    } catch(e) {
      console.log(`  ${table.padEnd(15)} SKIP`)
    }
  }

  // 6. INVOICE STATUS DISTRIBUTION
  console.log('\n--- INVOICE STATUS DISTRIBUTION ---')
  try {
    const statuses = await prisma.$queryRaw`
      SELECT "status", COUNT(*) as cnt, ROUND(SUM(CAST("total" AS NUMERIC)), 2) as total_val
      FROM "Invoice" 
      GROUP BY "status" 
      ORDER BY cnt DESC`
    statuses.forEach(s => console.log(`  ${(s.status || 'NULL').padEnd(20)} ${Number(s.cnt).toLocaleString().padStart(6)} invoices   $${Number(s.total_val || 0).toLocaleString()}`))
  } catch(e) { console.log('  ERROR:', e.message) }

  // 7. INVOICES BY MONTH (last 6)
  console.log('\n--- INVOICES BY MONTH (last 6) ---')
  try {
    const byMonth = await prisma.$queryRaw`
      SELECT TO_CHAR("date", 'YYYY-MM') as month, COUNT(*) as cnt, 
             ROUND(SUM(CAST("total" AS NUMERIC)), 2) as revenue
      FROM "Invoice" 
      WHERE "date" IS NOT NULL AND "date" > NOW() - INTERVAL '6 months'
      GROUP BY month 
      ORDER BY month DESC`
    byMonth.forEach(m => console.log(`  ${m.month}:  ${Number(m.cnt).toLocaleString().padStart(5)} invoices   $${Number(m.revenue || 0).toLocaleString()}`))
  } catch(e) { console.log('  ERROR:', e.message) }

  // 8. USERS
  console.log('\n--- USERS ---')
  try {
    const users = await prisma.user.findMany({ 
      select: { name: true, email: true, role: true, salespersonName: true },
      orderBy: { name: 'asc' }
    })
    users.forEach(u => {
      console.log(`  ${(u.name || 'N/A').padEnd(25)} ${(u.email || '').padEnd(35)} role=${(u.role || 'N/A').padEnd(10)} rep=${u.salespersonName || '-'}`)
    })
  } catch(e) { console.log('  ERROR:', e.message) }

  // 9. TOP ACCOUNTS BY REVENUE
  console.log('\n--- TOP 10 ACCOUNTS BY REVENUE ---')
  try {
    const top = await prisma.$queryRaw`
      SELECT a."companyName", COUNT(i.id) as inv_count, 
             ROUND(SUM(CAST(i."total" AS NUMERIC)), 2) as revenue
      FROM "Account" a 
      JOIN "Invoice" i ON i."accountId" = a.id 
      GROUP BY a.id, a."companyName" 
      ORDER BY revenue DESC NULLS LAST
      LIMIT 10`
    top.forEach(a => console.log(`  ${(a.companyName || 'N/A').padEnd(40)} ${Number(a.inv_count).toString().padStart(4)} inv   $${Number(a.revenue || 0).toLocaleString()}`))
  } catch(e) { console.log('  ERROR:', e.message) }

  // 10. NULL FIELD AUDIT
  console.log('\n--- NULL FIELD AUDIT ---')
  const nullChecks = [
    { table: 'Invoice', field: 'date', label: 'Invoices missing date' },
    { table: 'Invoice', field: 'total', label: 'Invoices missing total' },
    { table: 'Invoice', field: 'status', label: 'Invoices missing status' },
    { table: 'Invoice', field: 'salespersonName', label: 'Invoices missing salesperson' },
    { table: 'Account', field: 'companyName', label: 'Accounts missing name' },
    { table: 'Contact', field: 'email', label: 'Contacts missing email' },
    { table: 'Product', field: 'name', label: 'Products missing name' },
    { table: 'Product', field: 'rate', label: 'Products missing rate/price' },
  ]
  for (const { table, field, label } of nullChecks) {
    try {
      const result = await prisma.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "${table}" WHERE "${field}" IS NULL OR "${field}" = ''`)
      const cnt = Number(result[0].cnt)
      console.log(`  ${label.padEnd(35)} ${cnt} ${cnt > 0 ? '⚠️' : '✅'}`)
    } catch(e) {
      console.log(`  ${label.padEnd(35)} SKIP (column may not exist)`)
    }
  }

  // 11. SYNC CONFLICT CHECK
  console.log('\n--- SYNC CONFLICTS ---')
  try {
    const conflicts = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "syncConflict" = true`
    console.log(`  Invoice sync conflicts:  ${Number(conflicts[0].cnt)} ${Number(conflicts[0].cnt) > 0 ? '⚠️ NEEDS REVIEW' : '✅'}`)
  } catch(e) { console.log('  Invoice conflicts: SKIP (no syncConflict column)') }
  try {
    const conflicts = await prisma.$queryRaw`SELECT COUNT(*) as cnt FROM "SalesOrder" WHERE "syncConflict" = true`
    console.log(`  SalesOrder sync conflicts: ${Number(conflicts[0].cnt)} ${Number(conflicts[0].cnt) > 0 ? '⚠️ NEEDS REVIEW' : '✅'}`)
  } catch(e) {}

  // 12. PAYMENT RECONCILIATION
  console.log('\n--- PAYMENT RECONCILIATION ---')
  try {
    const totalPayments = await prisma.$queryRaw`SELECT ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as total FROM "Payment"`
    const totalInvoiced = await prisma.$queryRaw`SELECT ROUND(SUM(CAST("total" AS NUMERIC)), 2) as total FROM "Invoice" WHERE "status" != 'void' AND "status" != 'draft'`
    console.log(`  Total invoiced (non-void): $${Number(totalInvoiced[0].total || 0).toLocaleString()}`)
    console.log(`  Total payments received:   $${Number(totalPayments[0].total || 0).toLocaleString()}`)
    const ratio = Number(totalInvoiced[0].total) > 0 ? ((Number(totalPayments[0].total) / Number(totalInvoiced[0].total)) * 100).toFixed(1) : '0'
    console.log(`  Collection ratio:          ${ratio}%`)
  } catch(e) { console.log('  ERROR:', e.message) }

  // 13. SYNC STATUS
  console.log('\n--- SYNC STATUS (from SystemSetting) ---')
  try {
    const settings = await prisma.$queryRawUnsafe(`SELECT key, value FROM "SystemSetting" WHERE key LIKE '%sync%' OR key LIKE '%Sync%' LIMIT 20`)
    if (settings.length === 0) console.log('  No sync settings found')
    settings.forEach(s => {
      try {
        const val = JSON.parse(s.value)
        console.log(`  ${s.key}: lastSync=${val.lastSyncAt || 'N/A'}, enabled=${val.enabled}, interval=${val.intervalMinutes}min`)
      } catch {
        console.log(`  ${s.key}: ${s.value}`)
      }
    })
  } catch(e) { console.log('  ERROR:', e.message) }

  console.log('\n=== AUDIT COMPLETE ===')
}

audit()
  .catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1) })
  .finally(() => prisma.$disconnect())
