import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    // 1. Fetch checkpoint
    const cpRow = await prisma.systemSetting.findUnique({ where: { key: 'backfill_books_checkpoint' } })
    const checkpoint = cpRow ? JSON.parse(cpRow.value) : {}

    // 2. Fetch 2 uncached invoices
    const invoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { items: { equals: null as any } },
          { items: { path: ['line_items'], equals: null as any } },
          { items: { path: ['line_items'], equals: [] } }
        ]
      },
      select: { id: true, zohoId: true, items: true, status: true },
      take: 2
    })

    // 3. Fetch 2 quotes
    const quotes = await prisma.quote.findMany({
      where: {
        OR: [
          { items: { equals: null as any } },
          { items: { path: ['line_items'], equals: null as any } },
          { items: { path: ['line_items'], equals: [] } }
        ]
      },
      select: { id: true, zohoId: true, items: true, status: true },
      take: 2
    })

    // 4. Check one invoice by zohoId to see what its items contains
    const sampleInv = await prisma.invoice.findFirst({
      where: { zohoId: { not: '' } },
      select: { id: true, zohoId: true, items: true }
    })

    return NextResponse.json({
      success: true,
      checkpoint,
      invoices,
      quotes,
      sampleInv
    })
  } catch (err: any) {
    return NextResponse.json({
      success: false,
      error: err.message
    }, { status: 500 })
  }
}
