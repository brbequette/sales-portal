import { NextRequest, NextResponse } from "next/server"

const NETLIFY_FUNCTION_URL =
  process.env.NETLIFY_FUNCTION_URL ||
  process.env.URL ||
  "http://localhost:8888"

export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}))

    // Proxy to the Netlify function
    const fnUrl = `${NETLIFY_FUNCTION_URL}/.netlify/functions/bulk-calculate-costs`
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
  // Return current lock status from SystemSetting
  try {
    const { PrismaClient } = await import("@prisma/client")
    const prisma = new PrismaClient()

    const lock = await prisma.systemSetting.findUnique({ where: { key: "cost_calc_running" } })
    const [pendingInvoices, pendingQuotes, pendingSOs] = await Promise.all([
      prisma.invoice.count({ where: { pendingCostSync: true } }),
      prisma.quote.count({ where: { pendingCostSync: true } }),
      prisma.salesOrder.count({ where: { pendingCostSync: true } }),
    ])

    await prisma.$disconnect()

    return NextResponse.json({
      lock: lock ? JSON.parse(lock.value) : { running: false },
      pending: {
        invoices: pendingInvoices,
        quotes: pendingQuotes,
        salesOrders: pendingSOs,
        total: pendingInvoices + pendingQuotes + pendingSOs,
      },
    })
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
