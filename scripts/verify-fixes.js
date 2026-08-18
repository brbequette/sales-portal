const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function verify() {
  console.log('=== POST-FIX VERIFICATION ===\n')

  // Users
  const users = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "User"`
  console.log(`Users: ${Number(users[0].cnt)} (was 14, should be 12)`)

  // Status casing
  const badStatus = await p.$queryRaw`SELECT "status", COUNT(*) as cnt FROM "Invoice" WHERE "status" IN ('Paid','Void','PAID','VOID') GROUP BY "status"`
  console.log(`Bad status casing: ${badStatus.length === 0 ? '0 ✅' : badStatus.map(s => `${s.status}=${s.cnt}`).join(', ') + ' ⚠️'}`)

  // Orphan payments
  const orphans = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Payment" WHERE "invoiceDbId" IS NULL`
  console.log(`Orphan payments: ${Number(orphans[0].cnt)} (was 4,589) ${Number(orphans[0].cnt) < 200 ? '✅' : '⚠️'}`)

  // Payment reconciliation (now with links)
  const linkedPayments = await p.$queryRaw`SELECT COUNT(*) as cnt, ROUND(SUM(CAST("amount" AS NUMERIC)),2) as total FROM "Payment" WHERE "invoiceDbId" IS NOT NULL`
  console.log(`Linked payments: ${Number(linkedPayments[0].cnt).toLocaleString()} totaling $${Number(linkedPayments[0].total || 0).toLocaleString()}`)

  // Salesperson coverage
  const noSp = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "computedSalesperson" IS NULL OR "computedSalesperson" = ''`
  const withSp = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "computedSalesperson" IS NOT NULL AND "computedSalesperson" != ''`
  console.log(`Salesperson: ${Number(withSp[0].cnt).toLocaleString()} with / ${Number(noSp[0].cnt).toLocaleString()} without`)

  // Invoice number coverage
  const noNum = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "computedInvoiceNumber" IS NULL OR "computedInvoiceNumber" = ''`
  const withNum = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "computedInvoiceNumber" IS NOT NULL AND "computedInvoiceNumber" != ''`
  console.log(`Invoice number: ${Number(withNum[0].cnt).toLocaleString()} with / ${Number(noNum[0].cnt).toLocaleString()} without`)

  // Updated status distribution
  console.log('\n--- INVOICE STATUS (post-fix) ---')
  const statuses = await p.$queryRaw`
    SELECT "status", COUNT(*) as cnt FROM "Invoice" GROUP BY "status" ORDER BY cnt DESC`
  statuses.forEach(s => console.log(`  ${(s.status||'NULL').padEnd(20)} ${Number(s.cnt).toLocaleString()}`))

  // Rep distribution
  console.log('\n--- SALESPERSON DISTRIBUTION ---')
  const reps = await p.$queryRaw`
    SELECT "computedSalesperson" as rep, COUNT(*) as cnt, 
           ROUND(SUM(CAST("amount" AS NUMERIC)),2) as revenue
    FROM "Invoice" 
    WHERE "computedSalesperson" IS NOT NULL AND "computedSalesperson" != ''
    GROUP BY "computedSalesperson" ORDER BY revenue DESC NULLS LAST`
  if (reps.length === 0) console.log('  (none — rawData may not contain salesperson_name)')
  reps.forEach(r => console.log(`  ${(r.rep||'N/A').padEnd(25)} ${Number(r.cnt).toLocaleString().padStart(5)} inv   $${Number(r.revenue||0).toLocaleString()}`))

  // Remaining issues
  console.log('\n--- REMAINING ISSUES ---')
  const contactFreshness = await p.$queryRaw`SELECT MAX("updatedAt") as latest FROM "Contact"`
  const contactAge = ((Date.now() - new Date(contactFreshness[0].latest).getTime()) / (1000*60*60)).toFixed(0)
  console.log(`Contact sync staleness: ${contactAge} hours (should be <24)`)

  const stockIssue = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Product" WHERE stock = 0`
  console.log(`Products with 0 stock: ${Number(stockIssue[0].cnt).toLocaleString()} / 4,013`)

  const lineItems = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "LineItem"`
  console.log(`LineItem rows: ${Number(lineItems[0].cnt)} (pending backfill)`)

  console.log('\n=== VERIFICATION COMPLETE ===')
}

verify().catch(e => { console.error('ERROR:', e.message); process.exit(1) }).finally(() => p.$disconnect())
