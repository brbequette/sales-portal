import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.production') })

async function main() {
  let url = process.env.DATABASE_URL || '';
  if (url.includes('-pooler')) {
    url = url.replace('-pooler', '');
  }
  console.log("Resolved DATABASE_URL for local check:", url);
  const directPrisma = new PrismaClient({
    datasources: { db: { url } }
  });
  
  try {
    const row = await directPrisma.systemSetting.findUnique({ where: { key: 'backfill_books_checkpoint' } })
    if (row) {
      console.log("Checkpoint in DB:")
      console.log(JSON.stringify(JSON.parse(row.value), null, 2))
    } else {
      console.log("No checkpoint found.")
    }

    const invTotal = await directPrisma.invoice.count()
    const invWithId = await directPrisma.invoice.count({
      where: {
        OR: [
          { zohoId: { not: '' } },
          { items: { path: ['booksInvoiceId'], not: '' } }
        ]
      }
    })

    const soTotal = await directPrisma.salesOrder.count()
    const soWithId = await directPrisma.salesOrder.count({
      where: {
        OR: [
          { zohoId: { not: null as any } },
          { items: { path: ['booksSalesOrderId'], not: '' } }
        ]
      }
    })

    const qtTotal = await directPrisma.quote.count()
    const qtWithId = await directPrisma.quote.count({
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
  } finally {
    await directPrisma.$disconnect()
  }
}

main().catch(console.error)
