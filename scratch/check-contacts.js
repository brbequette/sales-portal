const { PrismaClient } = require("@prisma/client")

async function test() {
  const prisma = new PrismaClient()
  const account = await prisma.account.findFirst({
    where: { name: 'RACANELLI REBAR' },
    include: { contacts: true }
  })
  console.log(JSON.stringify(account.contacts, null, 2))
}

test()
