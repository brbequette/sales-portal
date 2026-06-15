const { PrismaClient } = require('@prisma/client')
const p = new PrismaClient()

async function main() {
  // Look at the Invoice table for anything with booksInvoiceId or paymentDate related to 7361
  // In Zoho Books, payments have their own payment_id number
  // Check if the invoice items contain a payment number 7361
  
  const invs = await p.invoice.findMany({
    where: {
      OR: [
        { items: { path: ['paymentNumber'], equals: '7361' } },
        { items: { path: ['paymentId'], string_contains: '7361' } },
        { items: { path: ['booksInvoiceId'], string_contains: '7361' } },
      ]
    },
    include: { account: { select: { name: true } } }
  })
  console.log('Invoices with payment ref 7361:', JSON.stringify(invs, null, 2))

  // Check what fields the items JSON can have - sample 5 invoices
  const sample = await p.invoice.findMany({ take: 3, where: { items: { not: {} } } })
  console.log('\nSample invoice items keys:', sample.map(i => Object.keys(i.items || {})))
}

main().catch(console.error).finally(() => p.$disconnect())
