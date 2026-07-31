import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const totalInvoices = await prisma.invoice.count()

    // 1. Items is null
    const itemsNull = await prisma.invoice.count({
      where: { items: { equals: null as any } }
    })

    // 2. Items has no line_items key (missing)
    const lineItemsMissing = await prisma.invoice.count({
      where: {
        NOT: {
          items: { path: ['line_items'], not: null as any }
        }
      }
    })

    // 3. Items has line_items key and it is null
    const lineItemsNull = await prisma.invoice.count({
      where: {
        items: { path: ['line_items'], equals: null as any }
      }
    })

    // 4. Items has line_items key and it is []
    const lineItemsEmptyArray = await prisma.invoice.count({
      where: {
        items: { path: ['line_items'], equals: [] }
      }
    })

    // 5. Items has line_items key and it is NOT [] (meaning cached)
    const lineItemsNotEmpty = await prisma.invoice.count({
      where: {
        items: { path: ['line_items'], not: [] }
      }
    })

    // 6. Invoices with zohoId
    const invoicesWithZohoId = await prisma.invoice.count({
      where: { zohoId: { not: '' } }
    })

    // 7. Invoices with booksInvoiceId JSON path
    const invoicesWithBooksInvoiceId = await prisma.invoice.count({
      where: { items: { path: ['booksInvoiceId'], not: '' } }
    })

    // Let's also check one invoice that is NOT in "lineItemsNotEmpty" to see its keys
    const sampleUncached = await prisma.invoice.findFirst({
      where: {
        NOT: {
          items: { path: ['line_items'], not: [] }
        }
      },
      select: { id: true, zohoId: true, items: true }
    })

    return NextResponse.json({
      success: true,
      totalInvoices,
      itemsNull,
      lineItemsMissing,
      lineItemsNull,
      lineItemsEmptyArray,
      lineItemsNotEmpty,
      invoicesWithZohoId,
      invoicesWithBooksInvoiceId,
      sampleUncached
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}
