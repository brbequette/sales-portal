const { PrismaClient } = require("@prisma/client")
const prisma = new PrismaClient()

async function test() {
  try {
    const id = "664670946" // or some account zohoId or internal id
    const account = await prisma.account.findFirst({
      include: {
        invoices: true,
        contacts: true
      }
    })
    console.log("Account found:", account ? account.name : "None")
  } catch (e) {
    console.error("DB Error:", e)
  } finally {
    await prisma.$disconnect()
  }
}

test()
