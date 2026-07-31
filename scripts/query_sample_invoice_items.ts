import { PrismaClient } from '@prisma/client'
import dotenv from 'dotenv'
import path from 'path'

dotenv.config({ path: path.join(__dirname, '../.env.production') })

async function main() {
  let url = process.env.DATABASE_URL || '';
  if (url.includes('-pooler')) {
    url = url.replace('-pooler', '');
  }
  const prisma = new PrismaClient({
    datasources: { db: { url } }
  });

  try {
    console.log("Loading a sample of invoices that don't have line_items (or have empty line_items)...")
    
    // Let's find invoices where items -> line_items is empty or missing
    const docs = await prisma.invoice.findMany({
      where: {
        OR: [
          { items: { equals: null as any } },
          { items: { path: ['line_items'], equals: null as any } },
          { items: { path: ['line_items'], equals: [] } }
        ]
      },
      select: { id: true, zohoId: true, items: true, status: true },
      take: 5
    })

    console.log(`Found ${docs.length} candidate documents:`)
    for (const doc of docs) {
      console.log(`\nInvoice ID: ${doc.id}, ZohoId: ${doc.zohoId}, Status: ${doc.status}`)
      console.log("Items JSON:", JSON.stringify(doc.items, null, 2))
    }

  } catch (err: any) {
    console.error("Error:", err.message)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(console.error)
