const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  console.log("Users:")
  for (const u of users) {
    console.log(`- ${u.name} (${u.email}) - Has Password: ${!!u.password}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
