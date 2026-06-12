const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { email: { contains: "ben" } }
  })
  
  console.log("Users matching 'ben':")
  for (const u of users) {
    console.log(`- ${u.name} (${u.email}) - Role: ${u.role}`)
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
