const { PrismaClient } = require('@prisma/client')

const prisma = new PrismaClient()

async function main() {
    const accCount = await prisma.account.count()
    const dealCount = await prisma.deal.count()
    const invCount = await prisma.invoice.count()
    const userCount = await prisma.user.count()
    
    console.log(`Accounts: ${accCount}`)
    console.log(`Deals: ${dealCount}`)
    console.log(`Invoices: ${invCount}`)
    console.log(`Users: ${userCount}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
