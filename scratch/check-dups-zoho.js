const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  const so = await p.$queryRawUnsafe('SELECT "zohoId", COUNT(*) as cnt FROM "SalesOrder" WHERE "zohoId" IS NOT NULL GROUP BY "zohoId" HAVING COUNT(*) > 1')
  const q = await p.$queryRawUnsafe('SELECT "zohoId", COUNT(*) as cnt FROM "Quote" WHERE "zohoId" IS NOT NULL GROUP BY "zohoId" HAVING COUNT(*) > 1')
  console.log('Dup SalesOrders:', so.length, so)
  console.log('Dup Quotes:', q.length, q)
  process.exit(0)
}
run()
