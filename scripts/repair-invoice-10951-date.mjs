import { PrismaClient } from '/app/node_modules/@prisma/client/default.js'

if (process.argv[2] !== '--apply' || process.argv[3] !== 'REPAIR-10951-DATE') {
  throw new Error('Apply token required')
}
const prisma = new PrismaClient()
try {
  const result = await prisma.invoice.update({
    where: { zohoId: '1254360000049306507' },
    data: {
      issueDate: new Date('2026-06-26T12:00:00.000Z'),
      dueDate: new Date('2026-07-26T12:00:00.000Z'),
    },
    select: { invoiceNumber: true, issueDate: true, dueDate: true },
  })
  console.log(JSON.stringify(result))
} finally {
  await prisma.$disconnect()
}
