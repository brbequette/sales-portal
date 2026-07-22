const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function checkUsers() {
  const users = await prisma.user.findMany()
  console.log(`USERS IN DB (${users.length}):`)
  users.forEach(u => console.log(` - ${u.id} | ${u.name} | ${u.email} | ${u.role}`))
}

checkUsers()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
