const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  console.log(users.map(u => `${u.id} | ${u.name} | ${u.role}`))
}

main().finally(() => prisma.$disconnect())
