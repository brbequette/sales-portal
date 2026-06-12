const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const result = await prisma.user.updateMany({
    where: { email: { contains: "ben" } },
    data: { role: "Administrator" }
  })
  
  console.log("Updated Ben to Administrator. Result:", result)
}

main().catch(console.error).finally(() => prisma.$disconnect())
