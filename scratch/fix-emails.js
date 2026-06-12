const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function main() {
  const users = await prisma.user.findMany()
  
  for (const u of users) {
    if (u.email.includes("@dummy.titandiamond.net") || u.email.includes("@dummy.titandiamond.com")) {
      const firstName = u.name.split(" ")[0].toLowerCase()
      const newEmail = `${firstName}@titandiamond.net`
      
      try {
        await prisma.user.update({
          where: { id: u.id },
          data: { email: newEmail }
        })
        console.log(`Updated email for ${u.name} from ${u.email} to ${newEmail}`)
      } catch (err) {
        console.log(`Failed to update ${u.name}: ${err.message}`)
      }
    }
  }
}

main().catch(console.error).finally(() => prisma.$disconnect())
