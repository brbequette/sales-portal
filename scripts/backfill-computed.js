const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function backfill() {
  console.log('=== BACKFILL NUMERIC COMPUTED COLUMNS ===\n')

  const updates = [
    { col: 'computedVigRate', src: 'vigRate', label: 'VIG Rate' },
    { col: 'computedVigRate', src: 'vig', label: 'VIG Rate (fallback)' },
    { col: 'computedDeadProfit', src: 'profit', label: 'Dead Profit' },
    { col: 'computedDeadCost', src: 'deadCostTotal', label: 'Dead Cost' },
    { col: 'computedUpfront', src: 'commission', label: 'Commission' },
    { col: 'computedFinal', src: 'total', label: 'Final Total' },
    { col: 'computedProfit', src: 'profit', label: 'Profit' },
  ]

  for (const { col, src, label } of updates) {
    try {
      const result = await p.$queryRawUnsafe(`
        UPDATE "Invoice" 
        SET "${col}" = CAST("items"->>'${src}' AS double precision)
        WHERE "${col}" IS NULL
        AND "items"->>'${src}' IS NOT NULL 
        AND "items"->>'${src}' != ''
        AND "items"->>'${src}' ~ '^-?[0-9]+\\.?[0-9]*$'
        RETURNING id`)
      console.log(`  ${label.padEnd(25)} ${result.length} updated`)
    } catch(e) {
      console.log(`  ${label.padEnd(25)} ERROR: ${e.message.substring(0, 80)}`)
    }
  }

  // Summary
  console.log('\n--- FINAL COVERAGE ---')
  const checks = [
    ['computedSalesperson', 'Salesperson'],
    ['computedInvoiceNumber', 'Invoice Number'],
    ['computedVigRate', 'VIG Rate'],
    ['computedDeadProfit', 'Dead Profit'],
    ['computedDeadCost', 'Dead Cost'],
    ['computedUpfront', 'Commission'],
    ['computedFinal', 'Final Total'],
    ['computedProfit', 'Profit'],
  ]
  const total = await p.$queryRaw`SELECT COUNT(*) as cnt FROM "Invoice"`
  const totalCnt = Number(total[0].cnt)
  for (const [col, label] of checks) {
    const filled = await p.$queryRawUnsafe(`SELECT COUNT(*) as cnt FROM "Invoice" WHERE "${col}" IS NOT NULL`)
    const pct = ((Number(filled[0].cnt) / totalCnt) * 100).toFixed(1)
    console.log(`  ${label.padEnd(20)} ${Number(filled[0].cnt).toLocaleString().padStart(6)} / ${totalCnt.toLocaleString()} (${pct}%)`)
  }

  console.log('\n=== COMPLETE ===')
}

backfill().catch(e => { console.error('ERROR:', e.message); process.exit(1) }).finally(() => p.$disconnect())
