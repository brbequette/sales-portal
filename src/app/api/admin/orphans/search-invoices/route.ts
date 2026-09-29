import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse

    const { searchParams } = new URL(req.url)
    const q = (searchParams.get("q") || "").trim()

    if (!q || q.length < 2) {
      const recent = await prisma.invoice.findMany({
        take: 20,
        orderBy: { issueDate: "desc" },
        include: { account: { select: { id: true, name: true } } }
      })
      return NextResponse.json({
        success: true,
        invoices: recent.map(inv => {
          const itemsData: any = inv.items || {}
          return {
            id: inv.id,
            zohoId: inv.zohoId,
            invoiceNumber: itemsData.invoiceNumber || inv.zohoId,
            customerName: inv.account?.name || itemsData.customer_name || "Unknown Customer",
            issueDate: inv.issueDate,
            totalAmount: inv.amount || itemsData.total || 0,
            status: inv.status || itemsData.status || null,
            referenceNumber: itemsData.reference_number || itemsData.salesorder_number || null,
            shipTo: itemsData.shipping_address || itemsData.customer_name || null
          }
        })
      })
    }

    const invoices = await prisma.invoice.findMany({
      where: {
        OR: [
          { zohoId: { contains: q, mode: "insensitive" } },
          { account: { name: { contains: q, mode: "insensitive" } } },
          { items: { path: ["invoiceNumber"], string_contains: q } },
          { items: { path: ["reference_number"], string_contains: q } },
          { items: { path: ["salesorder_number"], string_contains: q } },
          { items: { path: ["customer_name"], string_contains: q } },
          { items: { path: ["shipping_address"], string_contains: q } }
        ]
      },
      take: 25,
      orderBy: { issueDate: "desc" },
      include: { account: { select: { id: true, name: true } } }
    })

    const formatted = invoices.map(inv => {
      const itemsData: any = inv.items || {}
      return {
        id: inv.id,
        zohoId: inv.zohoId,
        invoiceNumber: itemsData.invoiceNumber || inv.zohoId,
        customerName: inv.account?.name || itemsData.customer_name || "Unknown Customer",
        issueDate: inv.issueDate,
        totalAmount: inv.amount || itemsData.total || 0,
        status: inv.status || itemsData.status || null,
        referenceNumber: itemsData.reference_number || itemsData.salesorder_number || null,
        shipTo: itemsData.shipping_address || itemsData.customer_name || null
      }
    })

    return NextResponse.json({
      success: true,
      invoices: formatted
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
