const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const count = await prisma.account.count()
  console.log(`Total Accounts in DB: ${count}`)
  const reps = await prisma.user.findMany({ select: { id: true, name: true, email: true, role: true } })
  console.log(`Users:`, reps)
}

main().catch(console.error).finally(() => prisma.$disconnect())
