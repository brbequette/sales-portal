const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function audit() {
  console.log('=== TITAN DIAMOND COMPLETE DATA AUDIT ===')
  console.log(`Timestamp: ${new Date().toISOString()}\n`)

  // INVOICE STATUS DISTRIBUTION (correct column: amount, issueDate)
  console.log('--- INVOICE STATUS DISTRIBUTION ---')
  const statuses = await p.$queryRaw`
    SELECT "status", COUNT(*) as cnt, ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as total_val
    FROM "Invoice" GROUP BY "status" ORDER BY cnt DESC`
  statuses.forEach(s => console.log(`  ${(s.status || 'NULL').padEnd(20)} ${Number(s.cnt).toLocaleString().padStart(6)} inv   $${Number(s.total_val || 0).toLocaleString()}`))

  // INVOICES BY MONTH (last 6)
  console.log('\n--- INVOICES BY MONTH (last 6) ---')
  const byMonth = await p.$queryRaw`
    SELECT TO_CHAR("issueDate", 'YYYY-MM') as month, COUNT(*) as cnt, 
           ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as revenue
    FROM "Invoice" 
    WHERE "issueDate" IS NOT NULL AND "issueDate" > NOW() - INTERVAL '6 months'
    GROUP BY month ORDER BY month DESC`
  byMonth.forEach(m => console.log(`  ${m.month}:  ${Number(m.cnt).toLocaleString().padStart(5)} inv   $${Number(m.revenue || 0).toLocaleString()}`))

  // USERS (correct columns)
  console.log('\n--- USERS ---')
  const users = await p.user.findMany({ 
    select: { name: true, email: true, role: true, showOnSalesBoard: true },
    orderBy: { name: 'asc' }
  })
  users.forEach(u => console.log(`  ${(u.name || 'N/A').padEnd(25)} ${(u.email || '').padEnd(35)} role=${(u.role || 'N/A').padEnd(10)} board=${u.showOnSalesBoard ? 'YES' : 'no'}`))

  // TOP ACCOUNTS (correct column: name, not companyName)
  console.log('\n--- TOP 10 ACCOUNTS BY REVENUE ---')
  const top = await p.$queryRaw`
    SELECT a."name", COUNT(i.id) as inv_count, 
           ROUND(SUM(CAST(i."amount" AS NUMERIC)), 2) as revenue
    FROM "Account" a JOIN "Invoice" i ON i."accountId" = a.id 
    GROUP BY a.id, a."name" 
    ORDER BY revenue DESC NULLS LAST LIMIT 10`
  top.forEach(a => console.log(`  ${(a.name || 'N/A').padEnd(40)} ${Number(a.inv_count).toString().padStart(4)} inv   $${Number(a.revenue || 0).toLocaleString()}`))

  // INVOICES MISSING SALESPERSON
  console.log('\n--- SALESPERSON COVERAGE ---')
  const noSalesperson = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "computedSalesperson" IS NULL OR "computedSalesperson" = ''`
  const withSalesperson = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "computedSalesperson" IS NOT NULL AND "computedSalesperson" != ''`
  console.log(`  Invoices with salesperson:    ${Number(withSalesperson[0].cnt).toLocaleString()}`)
  console.log(`  Invoices without salesperson: ${Number(noSalesperson[0].cnt).toLocaleString()} ${Number(noSalesperson[0].cnt) > 100 ? '⚠️' : '✅'}`)

  // SALESPERSON DISTRIBUTION  
  console.log('\n--- INVOICES BY SALESPERSON ---')
  const bySales = await p.$queryRaw`
    SELECT "computedSalesperson" as rep, COUNT(*) as cnt, 
           ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as revenue,
           ROUND(SUM(CAST("computedDeadProfit" AS NUMERIC)), 2) as profit
    FROM "Invoice" 
    WHERE "computedSalesperson" IS NOT NULL AND "computedSalesperson" != ''
    GROUP BY "computedSalesperson" ORDER BY revenue DESC NULLS LAST`
  bySales.forEach(r => console.log(`  ${(r.rep || 'N/A').padEnd(25)} ${Number(r.cnt).toLocaleString().padStart(5)} inv   $${Number(r.revenue || 0).toLocaleString().padStart(12)} rev   $${Number(r.profit || 0).toLocaleString().padStart(10)} profit`))

  // PAYMENT RECONCILIATION
  console.log('\n--- PAYMENT RECONCILIATION ---')
  const totalPayments = await p.$queryRaw`SELECT ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as total FROM "Payment"`
  const totalInvoiced = await p.$queryRaw`SELECT ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as total FROM "Invoice" WHERE "status" NOT IN ('void','draft')`
  const totalBalance = await p.$queryRaw`SELECT ROUND(SUM(CAST("balance" AS NUMERIC)), 2) as total FROM "Invoice" WHERE "status" NOT IN ('void','draft') AND "balance" IS NOT NULL`
  console.log(`  Total invoiced (non-void/draft): $${Number(totalInvoiced[0].total || 0).toLocaleString()}`)
  console.log(`  Total payments received:         $${Number(totalPayments[0].total || 0).toLocaleString()}`)
  console.log(`  Outstanding balance:             $${Number(totalBalance[0].total || 0).toLocaleString()}`)

  // OVERDUE INVOICES
  console.log('\n--- OVERDUE INVOICES ---')
  const overdue = await p.$queryRaw`
    SELECT COUNT(*) as cnt, ROUND(SUM(CAST("balance" AS NUMERIC)), 2) as total_balance
    FROM "Invoice" 
    WHERE "status" NOT IN ('void','draft','paid') 
    AND "dueDate" IS NOT NULL AND "dueDate" < NOW() 
    AND ("balance" IS NULL OR CAST("balance" AS NUMERIC) > 0)`
  console.log(`  Overdue invoices: ${Number(overdue[0].cnt)} with $${Number(overdue[0].total_balance || 0).toLocaleString()} outstanding`)

  // ORPHAN PAYMENTS DETAIL
  console.log('\n--- ORPHAN PAYMENTS (no linked invoice) ---')
  const orphanPayments = await p.$queryRaw`
    SELECT COUNT(*) as cnt, ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as total
    FROM "Payment" WHERE "invoiceDbId" IS NULL`
  console.log(`  Orphan payments: ${Number(orphanPayments[0].cnt).toLocaleString()} totaling $${Number(orphanPayments[0].total || 0).toLocaleString()} ⚠️`)

  // DEALS STATUS
  console.log('\n--- DEAL STAGE DISTRIBUTION ---')
  const dealStages = await p.$queryRaw`
    SELECT "stage", COUNT(*) as cnt, ROUND(SUM(CAST("amount" AS NUMERIC)), 2) as pipeline
    FROM "Deal" GROUP BY "stage" ORDER BY cnt DESC`
  dealStages.forEach(d => console.log(`  ${(d.stage || 'NULL').padEnd(30)} ${Number(d.cnt).toLocaleString().padStart(5)}   $${Number(d.pipeline || 0).toLocaleString()}`))

  // PRODUCTS CHECK
  console.log('\n--- PRODUCT INVENTORY ---')
  const prodStats = await p.$queryRaw`
    SELECT COUNT(*) as total, 
           SUM(CASE WHEN stock > 0 THEN 1 ELSE 0 END) as in_stock,
           SUM(CASE WHEN stock = 0 THEN 1 ELSE 0 END) as out_of_stock,
           SUM(CASE WHEN stock IS NULL THEN 1 ELSE 0 END) as unknown_stock
    FROM "Product"`
  const ps = prodStats[0]
  console.log(`  Total products: ${Number(ps.total)}`)
  console.log(`  In stock:       ${Number(ps.in_stock || 0)}`)
  console.log(`  Out of stock:   ${Number(ps.out_of_stock || 0)}`)
  console.log(`  Unknown stock:  ${Number(ps.unknown_stock || 0)}`)

  // CONTACTS PER ACCOUNT
  console.log('\n--- CONTACTS COVERAGE ---')
  const acctWithContacts = await p.$queryRaw`
    SELECT COUNT(DISTINCT a.id) as cnt FROM "Account" a JOIN "Contact" c ON c."accountId" = a.id`
  const acctTotal = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Account"`
  console.log(`  Accounts with contacts: ${Number(acctWithContacts[0].cnt).toLocaleString()} / ${Number(acctTotal[0].cnt).toLocaleString()} (${((Number(acctWithContacts[0].cnt)/Number(acctTotal[0].cnt))*100).toFixed(1)}%)`)

  // LAST SYNC STATUS
  console.log('\n--- SYNC TIMING ---')
  const syncSettings = await p.$queryRawUnsafe(`SELECT key, value FROM "SystemSetting" LIMIT 30`)
  syncSettings.forEach(s => {
    try {
      const v = JSON.parse(s.value)
      if (v.lastSyncAt || v.lastSyncedAt) {
        const ts = v.lastSyncAt || v.lastSyncedAt
        const ago = ((Date.now() - new Date(ts).getTime()) / (1000*60*60)).toFixed(1)
        console.log(`  ${s.key.padEnd(35)} ${ts} (${ago}h ago)`)
      }
    } catch { }
  })

  console.log('\n=== AUDIT COMPLETE ===')
}

audit().catch(e => { console.error('AUDIT FAILED:', e.message); process.exit(1) }).finally(() => p.$disconnect())
