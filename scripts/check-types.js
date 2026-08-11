const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()
async function run() {
  const r = await p.$queryRaw`SELECT column_name, data_type FROM information_schema.columns WHERE table_name='Invoice' AND column_name LIKE 'computed%' ORDER BY column_name`
  r.forEach(c => console.log(c.column_name, ':', c.data_type))
  await p.$disconnect()
}
run()
