const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function run() {
  // Get Invoice columns
  const invCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Invoice' ORDER BY ordinal_position`
  console.log('INVOICE COLUMNS:', invCols.map(c => c.column_name).join(', '))
  
  // Get Account columns
  const acctCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Account' ORDER BY ordinal_position`
  console.log('\nACCOUNT COLUMNS:', acctCols.map(c => c.column_name).join(', '))

  // Get User columns
  const userCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='User' ORDER BY ordinal_position`
  console.log('\nUSER COLUMNS:', userCols.map(c => c.column_name).join(', '))

  // Get Product columns
  const prodCols = await p.$queryRaw`SELECT column_name FROM information_schema.columns WHERE table_name='Product' ORDER BY ordinal_position`
  console.log('\nPRODUCT COLUMNS:', prodCols.map(c => c.column_name).join(', '))

  await p.$disconnect()
}
run().catch(e => { console.error(e); process.exit(1) })
