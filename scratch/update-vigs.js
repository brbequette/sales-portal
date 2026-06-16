const { PrismaClient } = require("@prisma/client")

const prisma = new PrismaClient()

async function main() {
  console.log("Starting VIG update script...")

  // Update records prior to 2025
  const allVigs = await prisma.monthlyVigGoal.findMany()
  
  let updatedPre2025 = 0
  let updatedPost2026 = 0

  for (const vig of allVigs) {
    const year = parseInt(vig.monthKey.split('-')[0], 10)
    
    if (year < 2025 && vig.manualVigRate !== 1.3) {
      await prisma.monthlyVigGoal.update({
        where: { id: vig.id },
        data: { manualVigRate: 1.3 }
      })
      updatedPre2025++
    }

    if (year >= 2026 && vig.metric !== 'PROFIT') {
      await prisma.monthlyVigGoal.update({
        where: { id: vig.id },
        data: { metric: 'PROFIT' }
      })
      updatedPost2026++
    }
  }

  console.log(`Updated ${updatedPre2025} VIG records from prior to 2025 (set manualVigRate = 1.3)`)
  console.log(`Updated ${updatedPost2026} VIG records from 2026 onwards (set metric = 'PROFIT')`)

  // Backfill 2026 records for all active users
  const users = await prisma.user.findMany()
  
  let backfilled = 0
  for (const user of users) {
    for (let month = 1; month <= 12; month++) {
      const monthKey = `2026-${String(month).padStart(2, '0')}`
      
      const existing = await prisma.monthlyVigGoal.findUnique({
        where: { repId_monthKey: { repId: user.id, monthKey } }
      })
      
      if (!existing) {
        await prisma.monthlyVigGoal.create({
          data: {
            repId: user.id,
            monthKey,
            metric: 'PROFIT',
            profitGoal: 20000,
            subtotalGoal: 40000
          }
        })
        backfilled++
      }
    }
  }

  console.log(`Backfilled ${backfilled} missing 2026 VIG records for users.`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
