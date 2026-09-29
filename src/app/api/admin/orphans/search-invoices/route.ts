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
      const [recentInvoices, recentSalesOrders, recentQuotes] = await Promise.all([
        prisma.invoice.findMany({
          take: 15,
          orderBy: { issueDate: "desc" },
          include: { account: { select: { id: true, name: true } } }
        }),
        prisma.salesOrder.findMany({
          take: 10,
          orderBy: { orderDate: "desc" },
          include: { account: { select: { id: true, name: true } } }
        }),
        prisma.quote.findMany({
          take: 10,
          orderBy: { createdAt: "desc" },
          include: { account: { select: { id: true, name: true } } }
        })
      ])

      const invoicesFmt = recentInvoices.map(inv => {
        const itemsData: any = inv.items || {}
        const num = inv.invoiceNumber || itemsData.invoiceNumber || inv.zohoId
        return {
          id: inv.id,
          zohoId: inv.zohoId,
          docType: "Invoice" as const,
          docNumber: num,
          invoiceNumber: num,
          customerName: inv.account?.name || itemsData.customer_name || "Unknown Customer",
          issueDate: inv.issueDate,
          totalAmount: inv.amount || itemsData.total || 0,
          status: inv.status || itemsData.status || null,
          referenceNumber: inv.salesorderNumber || itemsData.reference_number || itemsData.salesorder_number || null,
          shipTo: itemsData.shipping_address || itemsData.customer_name || null
        }
      })

      const salesOrdersFmt = recentSalesOrders.map(so => {
        const itemsData: any = so.items || {}
        const soNum = itemsData.salesorder_number || itemsData.so_number || so.zohoId
        return {
          id: so.id,
          zohoId: so.zohoId || "",
          docType: "SalesOrder" as const,
          docNumber: `SO #${soNum}`,
          invoiceNumber: String(soNum),
          customerName: so.account?.name || itemsData.customer_name || "Unknown Customer",
          issueDate: so.orderDate,
          totalAmount: so.amount || itemsData.total || 0,
          status: so.status || itemsData.status || null,
          referenceNumber: itemsData.reference_number || null,
          shipTo: itemsData.shipping_address || itemsData.delivery_address || itemsData.customer_name || null
        }
      })

      const quotesFmt = recentQuotes.map(qte => {
        const itemsData: any = qte.items || {}
        const qNum = itemsData.quote_number || itemsData.estimate_number || itemsData.number || qte.zohoId
        return {
          id: qte.id,
          zohoId: qte.zohoId || "",
          docType: "Estimate" as const,
          docNumber: `Est #${qNum}`,
          invoiceNumber: String(qNum),
          customerName: qte.account?.name || itemsData.customer_name || "Unknown Customer",
          issueDate: qte.createdAt,
          totalAmount: qte.amount || itemsData.total || 0,
          status: qte.status || itemsData.status || null,
          referenceNumber: itemsData.reference_number || null,
          shipTo: itemsData.shipping_address || itemsData.customer_name || null
        }
      })

      return NextResponse.json({
        success: true,
        invoices: [...invoicesFmt, ...salesOrdersFmt, ...quotesFmt]
      })
    }

    const [invoices, salesOrders, quotes] = await Promise.all([
      prisma.invoice.findMany({
        where: {
          OR: [
            { zohoId: { contains: q, mode: "insensitive" } },
            { invoiceNumber: { contains: q, mode: "insensitive" } },
            { salesorderNumber: { contains: q, mode: "insensitive" } },
            { account: { name: { contains: q, mode: "insensitive" } } },
            { items: { path: ["invoiceNumber"], string_contains: q } },
            { items: { path: ["reference_number"], string_contains: q } },
            { items: { path: ["salesorder_number"], string_contains: q } },
            { items: { path: ["customer_name"], string_contains: q } },
            { items: { path: ["shipping_address"], string_contains: q } }
          ]
        },
        take: 20,
        orderBy: { issueDate: "desc" },
        include: { account: { select: { id: true, name: true } } }
      }),
      prisma.salesOrder.findMany({
        where: {
          OR: [
            { zohoId: { contains: q, mode: "insensitive" } },
            { account: { name: { contains: q, mode: "insensitive" } } },
            { items: { path: ["salesorder_number"], string_contains: q } },
            { items: { path: ["reference_number"], string_contains: q } },
            { items: { path: ["customer_name"], string_contains: q } }
          ]
        },
        take: 15,
        orderBy: { orderDate: "desc" },
        include: { account: { select: { id: true, name: true } } }
      }),
      prisma.quote.findMany({
        where: {
          OR: [
            { zohoId: { contains: q, mode: "insensitive" } },
            { account: { name: { contains: q, mode: "insensitive" } } },
            { items: { path: ["quote_number"], string_contains: q } },
            { items: { path: ["estimate_number"], string_contains: q } },
            { items: { path: ["reference_number"], string_contains: q } },
            { items: { path: ["customer_name"], string_contains: q } }
          ]
        },
        take: 15,
        orderBy: { createdAt: "desc" },
        include: { account: { select: { id: true, name: true } } }
      })
    ])

    const formattedInvoices = invoices.map(inv => {
      const itemsData: any = inv.items || {}
      const num = inv.invoiceNumber || itemsData.invoiceNumber || inv.zohoId
      return {
        id: inv.id,
        zohoId: inv.zohoId,
        docType: "Invoice" as const,
        docNumber: num,
        invoiceNumber: num,
        customerName: inv.account?.name || itemsData.customer_name || "Unknown Customer",
        issueDate: inv.issueDate,
        totalAmount: inv.amount || itemsData.total || 0,
        status: inv.status || itemsData.status || null,
        referenceNumber: inv.salesorderNumber || itemsData.reference_number || itemsData.salesorder_number || null,
        shipTo: itemsData.shipping_address || itemsData.customer_name || null
      }
    })

    const formattedSalesOrders = salesOrders.map(so => {
      const itemsData: any = so.items || {}
      const soNum = itemsData.salesorder_number || itemsData.so_number || so.zohoId
      return {
        id: so.id,
        zohoId: so.zohoId || "",
        docType: "SalesOrder" as const,
        docNumber: `SO #${soNum}`,
        invoiceNumber: String(soNum),
        customerName: so.account?.name || itemsData.customer_name || "Unknown Customer",
        issueDate: so.orderDate,
        totalAmount: so.amount || itemsData.total || 0,
        status: so.status || itemsData.status || null,
        referenceNumber: itemsData.reference_number || null,
        shipTo: itemsData.shipping_address || itemsData.delivery_address || itemsData.customer_name || null
      }
    })

    const formattedQuotes = quotes.map(qte => {
      const itemsData: any = qte.items || {}
      const qNum = itemsData.quote_number || itemsData.estimate_number || itemsData.number || qte.zohoId
      return {
        id: qte.id,
        zohoId: qte.zohoId || "",
        docType: "Estimate" as const,
        docNumber: `Est #${qNum}`,
        invoiceNumber: String(qNum),
        customerName: qte.account?.name || itemsData.customer_name || "Unknown Customer",
        issueDate: qte.createdAt,
        totalAmount: qte.amount || itemsData.total || 0,
        status: qte.status || itemsData.status || null,
        referenceNumber: itemsData.reference_number || null,
        shipTo: itemsData.shipping_address || itemsData.customer_name || null
      }
    })

    return NextResponse.json({
      success: true,
      invoices: [...formattedInvoices, ...formattedSalesOrders, ...formattedQuotes]
    })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

