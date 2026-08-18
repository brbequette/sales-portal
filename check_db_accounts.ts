import { PrismaClient } from '@prisma/client'
import * as path from 'path'

const prisma = new PrismaClient()

async function main() {
  try {
    console.log("Searching database for accounts matching '1 Priority'...")
    const accounts = await prisma.account.findMany({
      where: {
        name: {
          contains: '1 Priority',
          mode: 'insensitive'
        }
      },
      include: {
        invoices: true,
        salesOrders: true,
        contacts: true
      }
    })

    console.log(`Found ${accounts.length} accounts:`)
    for (const acc of accounts) {
      console.log('Account:', {
        id: acc.id,
        zohoId: acc.zohoId,
        name: acc.name,
        invoicesCount: acc.invoices.length,
        salesOrdersCount: acc.salesOrders.length
      })
      if (acc.invoices.length > 0) {
        console.log('  Invoices:', acc.invoices.map(i => ({ id: i.id, zohoId: i.zohoId })))
      }
      if (acc.salesOrders.length > 0) {
        console.log('  Sales Orders:', acc.salesOrders.map(so => ({ id: so.id, zohoId: so.zohoId })))
      }
    }

    // Let's list some invoices to see what is synced in the system
    console.log("\nListing last 5 invoices from database to check format:")
    const invoices = await prisma.invoice.findMany({
      take: 5,
      orderBy: { createdAt: 'desc' }
    })
    for (const inv of invoices) {
      const details: any = inv.items || {}
      console.log(`Invoice ${details.invoice_number || inv.zohoId}: accountId = ${inv.accountId}, customerName = ${details.customer_name}`)
    }

  } catch (err: any) {
    console.error(err)
  } finally {
    await prisma.$disconnect()
  }
}

main()
