const { PrismaClient } = require('@prisma/client')
const prisma = new PrismaClient()

async function main() {
  const invoices = await prisma.invoice.count()
  const quotes = await prisma.quote.count()
  const salesOrders = await prisma.salesOrder.count()
  const purchaseOrders = await prisma.purchaseOrder.count()
  const payments = await prisma.payment.count()
  const products = await prisma.product.count()
  const accounts = await prisma.account.count()

  console.log("=== DATABASE BACKFILL STATISTICS ===")
  console.log(`• Accounts: ${accounts.toLocaleString()}`)
  console.log(`• Products: ${products.toLocaleString()}`)
  console.log(`• Invoices: ${invoices.toLocaleString()}`)
  console.log(`• Quotes / Estimates: ${quotes.toLocaleString()}`)
  console.log(`• Sales Orders: ${salesOrders.toLocaleString()}`)
  console.log(`• Purchase Orders: ${purchaseOrders.toLocaleString()}`)
  console.log(`• Payments: ${payments.toLocaleString()}`)
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
