import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// GET — Fetch all sales orders with their packages for the shipping center
export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url)
    const status = url.searchParams.get("status") || "all"
    const search = url.searchParams.get("search") || ""
    const page = parseInt(url.searchParams.get("page") || "1")
    const limit = parseInt(url.searchParams.get("limit") || "50")

    // Fetch SOs that are not void/draft (active orders)
    const salesOrders = await prisma.salesOrder.findMany({
      where: {
        status: { notIn: ["Void", "Draft", "Cancelled"] },
      },
      include: { account: { select: { id: true, name: true } } },
      orderBy: { orderDate: "desc" },
    })

    // Fetch all packages
    const packages = await prisma.package.findMany({
      orderBy: { date: "desc" },
    })

    // Build a map of packages by salesOrderId (zohoId)
    const packagesBySOId = new Map<string, any[]>()
    for (const pkg of packages) {
      const soId = pkg.salesOrderId || ""
      if (!packagesBySOId.has(soId)) packagesBySOId.set(soId, [])
      packagesBySOId.get(soId)!.push(pkg)
    }

    // Also build by salesOrderNumber for fallback matching
    const packagesBySONumber = new Map<string, any[]>()
    for (const pkg of packages) {
      const soNum = pkg.salesOrderNumber || ""
      if (soNum) {
        if (!packagesBySONumber.has(soNum)) packagesBySONumber.set(soNum, [])
        packagesBySONumber.get(soNum)!.push(pkg)
      }
    }

    // Enrich each SO with shipping status
    let results = salesOrders.map(so => {
      const items = (so.items as any) || {}
      const soNumber = items.salesOrderNumber || items.salesorder_number || so.zohoId || ""
      const soZohoId = so.zohoId || ""

      // Find packages for this SO
      const soPkgs = packagesBySOId.get(soZohoId) || packagesBySONumber.get(soNumber) || []

      // Derive shipping status
      let shipStatus: "needs_packaging" | "packaged" | "shipped" | "delivered" = "needs_packaging"
      if (soPkgs.length > 0) {
        const allDelivered = soPkgs.every((p: any) => p.status?.toLowerCase() === "delivered")
        const anyShipped = soPkgs.some((p: any) =>
          p.trackingNumber || p.status?.toLowerCase() === "shipped" || p.status?.toLowerCase() === "delivered"
        )
        if (allDelivered) shipStatus = "delivered"
        else if (anyShipped) shipStatus = "shipped"
        else shipStatus = "packaged"
      }

      // Extract shipping address from SO items
      const shippingAddress = items.shipping_address || items.shippingAddress || null

      // Line items
      const lineItems = items.line_items || items.lineItems || []
      const lineItemCount = Array.isArray(lineItems) ? lineItems.length : 0
      const lineItemNames = Array.isArray(lineItems)
        ? lineItems.slice(0, 3).map((li: any) => li.name || li.itemName || "").filter(Boolean)
        : []

      return {
        id: so.id,
        zohoId: soZohoId,
        soNumber,
        customerName: so.account?.name || items.customer_name || "Unknown",
        accountId: so.accountId,
        orderDate: so.orderDate,
        amount: so.amount,
        status: so.status,
        shipStatus,
        shippingAddress,
        lineItemCount,
        lineItemNames,
        salesperson: items.salesperson || items.salesperson_name || "",
        packages: soPkgs.map((p: any) => ({
          id: p.id,
          zohoId: p.zohoId,
          packageNumber: p.packageNumber,
          date: p.date,
          status: p.status,
          carrier: p.carrier,
          trackingNumber: p.trackingNumber,
          shippingCharge: p.shippingCharge,
          items: p.items,
        })),
      }
    })

    // Apply search filter
    if (search) {
      const s = search.toLowerCase()
      results = results.filter(r =>
        r.soNumber.toLowerCase().includes(s) ||
        r.customerName.toLowerCase().includes(s) ||
        r.salesperson.toLowerCase().includes(s)
      )
    }

    // Apply status filter
    if (status !== "all") {
      results = results.filter(r => r.shipStatus === status)
    }

    // Pagination
    const total = results.length
    const paginated = results.slice((page - 1) * limit, page * limit)

    // Status counts for tabs
    const counts = {
      all: results.length,
      needs_packaging: results.filter(r => r.shipStatus === "needs_packaging").length,
      packaged: results.filter(r => r.shipStatus === "packaged").length,
      shipped: results.filter(r => r.shipStatus === "shipped").length,
      delivered: results.filter(r => r.shipStatus === "delivered").length,
    }

    // Recalculate counts from full (pre-search-filter) results for tabs
    const allResults = salesOrders.map(so => {
      const soZohoId = so.zohoId || ""
      const items = (so.items as any) || {}
      const soNumber = items.salesOrderNumber || items.salesorder_number || so.zohoId || ""
      const soPkgs = packagesBySOId.get(soZohoId) || packagesBySONumber.get(soNumber) || []
      let shipStatus: string = "needs_packaging"
      if (soPkgs.length > 0) {
        const allDelivered = soPkgs.every((p: any) => p.status?.toLowerCase() === "delivered")
        const anyShipped = soPkgs.some((p: any) =>
          p.trackingNumber || p.status?.toLowerCase() === "shipped" || p.status?.toLowerCase() === "delivered"
        )
        if (allDelivered) shipStatus = "delivered"
        else if (anyShipped) shipStatus = "shipped"
        else shipStatus = "packaged"
      }
      return { shipStatus }
    })

    const totalCounts = {
      all: allResults.length,
      needs_packaging: allResults.filter(r => r.shipStatus === "needs_packaging").length,
      packaged: allResults.filter(r => r.shipStatus === "packaged").length,
      shipped: allResults.filter(r => r.shipStatus === "shipped").length,
      delivered: allResults.filter(r => r.shipStatus === "delivered").length,
    }

    return NextResponse.json({
      success: true,
      data: paginated,
      total,
      page,
      limit,
      counts: search ? counts : totalCounts,
    })
  } catch (err: any) {
    console.error("shipping GET error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT — Update package tracking or status
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, packageId, carrier, trackingNumber, status } = body

    if (!packageId) {
      return NextResponse.json({ error: "Missing packageId" }, { status: 400 })
    }

    const pkg = await prisma.package.findUnique({ where: { id: packageId } })
    if (!pkg) {
      return NextResponse.json({ error: "Package not found" }, { status: 404 })
    }

    if (action === "addTracking") {
      const updated = await prisma.package.update({
        where: { id: packageId },
        data: {
          carrier: carrier || pkg.carrier,
          trackingNumber: trackingNumber || pkg.trackingNumber,
          status: "shipped",
        },
      })
      return NextResponse.json({ success: true, package: updated })
    }

    if (action === "markShipped") {
      const updated = await prisma.package.update({
        where: { id: packageId },
        data: { status: "shipped" },
      })
      return NextResponse.json({ success: true, package: updated })
    }

    if (action === "markDelivered") {
      const updated = await prisma.package.update({
        where: { id: packageId },
        data: { status: "delivered" },
      })
      return NextResponse.json({ success: true, package: updated })
    }

    return NextResponse.json({ error: "Invalid action" }, { status: 400 })
  } catch (err: any) {
    console.error("shipping PUT error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
