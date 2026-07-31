import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env') })
const prisma = new PrismaClient()

async function main() {
  const row = await prisma.systemSetting.findUnique({ where: { key: 'backfill_books_checkpoint' } })
  if (row) {
    console.log("Checkpoint in DB:")
    console.log(JSON.stringify(JSON.parse(row.value), null, 2))
  } else {
    console.log("No checkpoint found.")
  }

  const invTotal = await prisma.invoice.count()
  const invWithId = await prisma.invoice.count({
    where: {
      OR: [
        { zohoId: { not: '' } },
        { items: { path: ['booksInvoiceId'], not: '' } }
      ]
    }
  })

  const soTotal = await prisma.salesOrder.count()
  const soWithId = await prisma.salesOrder.count({
    where: {
      OR: [
        { zohoId: { not: null as any } },
        { items: { path: ['booksSalesOrderId'], not: '' } }
      ]
    }
  })

  const qtTotal = await prisma.quote.count()
  const qtWithId = await prisma.quote.count({
    where: {
      OR: [
        { zohoId: { not: null as any } },
        { items: { path: ['booksEstimateId'], not: '' } }
      ]
    }
  })

  console.log(`\nInvoices: Total=${invTotal}, HasBooksID=${invWithId}`)
  console.log(`Sales Orders: Total=${soTotal}, HasBooksID=${soWithId}`)
  console.log(`Quotes: Total=${qtTotal}, HasBooksID=${qtWithId}`)
}

main().catch(console.error).finally(() => prisma.$disconnect())
