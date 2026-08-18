import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST() {
  try {
    console.log("Loading invoices from 2026...")
    const startDate = new Date('2026-01-01T00:00:00.000Z')
    const endDate = new Date('2026-12-31T23:59:59.999Z')

    const invoices = await prisma.invoice.findMany({
      where: {
        issueDate: {
          gte: startDate,
          lte: endDate
        }
      },
      select: {
        id: true,
        zohoId: true,
        issueDate: true,
        items: true
      }
    })

    // Get all sales order numbers from invoices
    const salesOrderNumbers = invoices
      .map(inv => {
        const items = (inv.items as any) || {}
        return items.salesOrderNumber || items.salesorder_number || items.salesorder_number_formatted
      })
      .filter(Boolean)

    const uniqueSoNums = Array.from(new Set(salesOrderNumbers))

    // Load all SalesOrders that match these numbers
    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        OR: uniqueSoNums.flatMap(soNum => [
          {
            items: {
              path: ['salesOrderNumber'],
              equals: soNum
            }
          },
          {
            items: {
              path: ['salesorder_number'],
              equals: soNum
            }
          }
        ]) as any
      },
      select: {
        orderDate: true,
        items: true
      }
    })

    const salesOrderDateMap = new Map<string, Date>()
    for (const so of salesOrders) {
      const soItems = (so.items as any) || {}
      const soNum = soItems.salesOrderNumber || soItems.salesorder_number
      if (soNum && so.orderDate) {
        salesOrderDateMap.set(String(soNum).trim().toLowerCase(), so.orderDate)
      }
    }

    let updatedCount = 0
    let skippedCount = 0

    for (const inv of invoices) {
      const items = (inv.items as any) || {}
      const soNum = items.salesOrderNumber || items.salesorder_number
      if (soNum) {
        const cleanSoNum = String(soNum).trim().toLowerCase()
        const matchedDate = salesOrderDateMap.get(cleanSoNum)
        if (matchedDate) {
          if (inv.issueDate.getTime() !== matchedDate.getTime()) {
            await prisma.invoice.update({
              where: { id: inv.id },
              data: { issueDate: matchedDate }
            })
            updatedCount++
            continue
          }
        }
      }
      skippedCount++
    }

    return NextResponse.json({ success: true, updatedCount, skippedCount })
  } catch (error: any) {
    console.error("Backfill invoice dates error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
