const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  const accounts = await p.account.findMany({
    select: { id: true, zohoId: true, name: true, createdAt: true }
  })

  console.log('Total accounts:', accounts.length)

  // Group by normalized name
  const byName = {}
  for (const acc of accounts) {
    const key = acc.name?.trim().toUpperCase()
    if (!key) continue
    if (!byName[key]) byName[key] = []
    byName[key].push(acc)
  }

  const dups = Object.entries(byName).filter(([k, v]) => v.length > 1)
  const totalDupAccounts = dups.reduce((sum, [k, v]) => sum + v.length, 0)
  const keepCount = dups.length // one per group we'd keep
  const deleteCount = totalDupAccounts - keepCount

  console.log('Names with duplicates:', dups.length)
  console.log('Total accounts in duplicate groups:', totalDupAccounts)
  console.log('Would keep (1 per name):', keepCount)
  console.log('Would delete:', deleteCount)

  // Breakdown by zohoId prefix pattern
  let stubCount = 0, zcrm_Count = 0, books_Count = 0, clean_Count = 0
  for (const acc of accounts) {
    const z = acc.zohoId || ''
    if (z.startsWith('stub_')) stubCount++
    else if (z.startsWith('zcrm_')) zcrm_Count++
    else if (z.match(/^1254/)) books_Count++
    else if (z.match(/^6821/)) clean_Count++
  }
  console.log('\nZoho ID breakdown:')
  console.log('  CRM accounts (6821...):   ', clean_Count)
  console.log('  Books accounts (1254...):  ', books_Count)
  console.log('  zcrm_ prefixed:            ', zcrm_Count)
  console.log('  stub_ prefixed:            ', stubCount)
  console.log('  Other:                     ', accounts.length - stubCount - zcrm_Count - books_Count - clean_Count)
}

main().catch(console.error).finally(() => p.$disconnect())
