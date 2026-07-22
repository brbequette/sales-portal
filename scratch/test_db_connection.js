const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient({ log: ['query', 'error', 'warn'] })

async function testConnection() {
  console.log("=== TESTING PRISMA CONNECTION DIRECTLY ===")
  try {
    const count = await prisma.user.count()
    console.log("User count in DB:", count)
    const users = await prisma.user.findMany({ select: { id: true, name: true, role: true } })
    console.log("Users in DB:", users)
  } catch (e) {
    console.error("Connection error:", e)
  } finally {
    await prisma.$disconnect()
  }
}

testConnection()
