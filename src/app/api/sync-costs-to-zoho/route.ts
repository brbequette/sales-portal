import { NextRequest, NextResponse } from "next/server"

const NETLIFY_FUNCTION_URL =
  process.env.NETLIFY_FUNCTION_URL ||
  process.env.URL ||
  "http://localhost:8888"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    const fnUrl = `${NETLIFY_FUNCTION_URL}/.netlify/functions/sync-costs-to-zoho`
    const res = await fetch(fnUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    })

    const data = await res.json()
    return NextResponse.json(data, { status: res.status })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function GET() {
  // Return sync status: how many docs are pending, last sync times
  try {
    const { PrismaClient } = await import("@prisma/client")
    const prisma = new PrismaClient()

    const [pendingInvoices, pendingQuotes, pendingSOs] = await Promise.all([
      prisma.invoice.count({ where: { pendingCostSync: true } }),
      prisma.quote.count({ where: { pendingCostSync: true } }),
      prisma.salesOrder.count({ where: { pendingCostSync: true } }),
    ])

    // Find most recent sync times
    const lastInvoiceSync = await prisma.invoice.findFirst({
      where: { lastCostSyncAt: { not: null } },
      orderBy: { lastCostSyncAt: "desc" },
      select: { lastCostSyncAt: true },
    })
    const lastQuoteSync = await prisma.quote.findFirst({
      where: { lastCostSyncAt: { not: null } },
      orderBy: { lastCostSyncAt: "desc" },
      select: { lastCostSyncAt: true },
    })
    const lastSOSync = await prisma.salesOrder.findFirst({
      where: { lastCostSyncAt: { not: null } },
      orderBy: { lastCostSyncAt: "desc" },
      select: { lastCostSyncAt: true },
    })

    await prisma.$disconnect()

    return NextResponse.json({
      pending: {
        invoices: pendingInvoices,
        quotes: pendingQuotes,
        salesOrders: pendingSOs,
        total: pendingInvoices + pendingQuotes + pendingSOs,
      },
      lastSync: {
        invoices:   lastInvoiceSync?.lastCostSyncAt ?? null,
        quotes:     lastQuoteSync?.lastCostSyncAt ?? null,
        salesOrders: lastSOSync?.lastCostSyncAt ?? null,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
