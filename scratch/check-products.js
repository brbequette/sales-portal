const { PrismaClient } = require("@prisma/client")
async function test() {
  const prisma = new PrismaClient()
  const p = await prisma.product.findMany()
  console.log(JSON.stringify(p, null, 2))
}
test()
