const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function checkSync() {
  console.log('=== SYNC STATUS CHECK ===\n')

  // All SystemSettings
  console.log('--- ALL SYSTEM SETTINGS ---')
  const settings = await p.$queryRaw`SELECT key, value FROM "SystemSetting" ORDER BY key`
  for (const s of settings) {
    try {
      const v = JSON.parse(s.value)
      if (typeof v === 'object') {
        console.log(`  ${s.key}:`)
        for (const [k2, v2] of Object.entries(v)) {
          console.log(`    ${k2}: ${v2}`)
        }
      } else {
        console.log(`  ${s.key}: ${v}`)
      }
    } catch {
      console.log(`  ${s.key}: ${s.value}`)
    }
  }

  // Data freshness per table
  console.log('\n--- DATA FRESHNESS ---')
  const tables = [
    { name: 'Invoice', col: 'updatedAt' },
    { name: 'Account', col: 'updatedAt' },
    { name: 'Contact', col: 'updatedAt' },
    { name: 'Product', col: 'updatedAt' },
    { name: 'Payment', col: 'updatedAt' },
    { name: 'SalesOrder', col: 'updatedAt' },
    { name: 'Quote', col: 'updatedAt' },
    { name: 'Deal', col: 'updatedAt' },
  ]
  const now = Date.now()
  for (const t of tables) {
    try {
      const r = await p.$queryRawUnsafe(`SELECT MAX("${t.col}") as latest FROM "${t.name}"`)
      const ts = r[0].latest
      const hoursAgo = ts ? ((now - new Date(ts).getTime()) / (1000*60*60)).toFixed(1) : 'NEVER'
      const status = !ts ? '❌' : parseFloat(hoursAgo) < 24 ? '✅' : parseFloat(hoursAgo) < 72 ? '🟡' : '🔴'
      console.log(`  ${status} ${t.name.padEnd(15)} Last: ${ts ? new Date(ts).toISOString() : 'NEVER'}  (${hoursAgo}h ago)`)
    } catch(e) { console.log(`  ❓ ${t.name.padEnd(15)} ERROR`) }
  }

  await p.$disconnect()
}
checkSync().catch(e => { console.error(e.message); process.exit(1) })
