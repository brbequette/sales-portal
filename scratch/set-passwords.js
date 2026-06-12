const { PrismaClient } = require("@prisma/client")
const bcrypt = require("bcryptjs")
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany({
    where: { password: null }
  })
  
  if (users.length === 0) {
    console.log("All users already have passwords.")
    return
  }
  
  const hashedPassword = await bcrypt.hash("Titan2026!", 10)
  
  for (const u of users) {
    await prisma.user.update({
      where: { id: u.id },
      data: { password: hashedPassword }
    })
    console.log(`Set password for ${u.name} (${u.email})`)
  }
  
  console.log("Done. Default password is 'Titan2026!'")
}

main().catch(console.error).finally(() => prisma.$disconnect())
