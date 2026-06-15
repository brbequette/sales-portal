const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function backfillQuality() {
  const sixMonthsAgo = new Date()
  sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6)
  const twelveMonthsAgo = new Date()
  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)

  console.log('Cutoff dates:')
  console.log(`  HOT: purchased after ${sixMonthsAgo.toISOString().slice(0, 10)}`)
  console.log(`  WARM: purchased after ${twelveMonthsAgo.toISOString().slice(0, 10)}`)
  console.log(`  COLD: purchased before ${twelveMonthsAgo.toISOString().slice(0, 10)}`)
  console.log(`  NEVER_STATUSED: no invoices`)
  console.log()

  // Get all accounts (skip DO_NOT_CALL and ON_HOLD)
  const accounts = await prisma.account.findMany({
    where: { quality: { notIn: ['DO_NOT_CALL', 'ON_HOLD'] } },
    select: {
      id: true,
      name: true,
      quality: true,
      invoices: {
        select: { issueDate: true, status: true },
        where: { status: { notIn: ['Void', 'Draft', 'Writeoff', 'Write_off', 'Write Off', 'Bad Debt'] } },
        orderBy: { issueDate: 'desc' },
        take: 1
      }
    }
  })

  console.log(`Processing ${accounts.length} accounts...`)

  let hotCount = 0, warmCount = 0, coldCount = 0, neverCount = 0, unchanged = 0
  const updates = []

  for (const acct of accounts) {
    let newQuality
    const latestInvoice = acct.invoices[0]
    if (!latestInvoice || !latestInvoice.issueDate) {
      newQuality = 'NEVER_STATUSED'
    } else {
      const invoiceDate = new Date(latestInvoice.issueDate)
      if (invoiceDate >= sixMonthsAgo) {
        newQuality = 'HOT'
      } else if (invoiceDate >= twelveMonthsAgo) {
        newQuality = 'WARM'
      } else {
        newQuality = 'COLD'
      }
    }

    if (newQuality !== acct.quality) {
      updates.push(prisma.account.update({
        where: { id: acct.id },
        data: { quality: newQuality }
      }))
    }

    if (newQuality === 'HOT') hotCount++
    else if (newQuality === 'WARM') warmCount++
    else if (newQuality === 'COLD') coldCount++
    else neverCount++
  }

  // Execute updates in batches
  for (let i = 0; i < updates.length; i += 50) {
    await prisma.$transaction(updates.slice(i, i + 50))
  }

  console.log(`\nResults:`)
  console.log(`  🔥 HOT: ${hotCount}`)
  console.log(`  ☀️  WARM: ${warmCount}`)
  console.log(`  ❄️  COLD: ${coldCount}`)
  console.log(`  ❓ NEVER_STATUSED: ${neverCount}`)
  console.log(`  Updated: ${updates.length}`)
  console.log(`  Unchanged: ${accounts.length - updates.length}`)

  process.exit(0)
}

backfillQuality()
