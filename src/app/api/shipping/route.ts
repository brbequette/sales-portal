import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getAuthenticatedDbUser } from "@/lib/session-user"
import { financialZohoLineItems } from "@/lib/zoho-line-items"
import { databaseReadHeaders, getDatabaseFreshness, LOCAL_DATA_INCOMPLETE } from "@/lib/database-read-metadata"

// GET -- Fetch all sales orders with their packages for the shipping center
export async function GET(req: NextRequest) {
  const startedAt = performance.now()
  try {
    const actor = await getAuthenticatedDbUser()
    if (!actor) {
      return NextResponse.json({ error: "Authentication required" }, { status: 401 })
    }
    const isAdmin = actor.isAdmin

    const url = new URL(req.url)
    const status = url.searchParams.get("status") || "all"
    const search = url.searchParams.get("search") || ""
    const salespersonFilter = url.searchParams.get("salesperson") || ""
    const carrierFilter = url.searchParams.get("carrier") || ""
    const sortBy = url.searchParams.get("sortBy") || "orderDate"
    const sortDir = url.searchParams.get("sortDir") || "desc"
    const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1)
    const pageSize = Math.min(100, Math.max(1, parseInt(url.searchParams.get('pageSize') || '50', 10) || 50))

    // Fetch SOs that are not void/draft (active orders)
    let salesOrders = await prisma.salesOrder.findMany({
      where: {
        status: { notIn: ["Void", "Draft", "Cancelled", "Closed"] },
        ...(!isAdmin ? { account: { ownerId: actor.user.id } } : {}),
      },
      take: 1000,
      include: { 
        account: { 
          select: { 
            id: true, 
            name: true,
            shippingStreet: true,
            shippingCity: true,
            shippingState: true,
            shippingZip: true,
            billingStreet: true,
            billingCity: true,
            billingState: true,
            billingZip: true
          } 
        } 
      },
      orderBy: { orderDate: "desc" },
    })

    const visibleSalesOrderIds = salesOrders.map(order => order.zohoId).filter((id): id is string => Boolean(id))
    const visibleSalesOrderNumbers = salesOrders
      .map(order => {
        const items = (order.items as any) || {}
        return items.salesOrderNumber || items.salesorder_number || items.sales_order_number || null
      })
      .filter((number): number is string => Boolean(number))

    const fulfillmentScope = [
      ...(visibleSalesOrderIds.length ? [{ salesOrderId: { in: visibleSalesOrderIds } }] : []),
      ...(visibleSalesOrderNumbers.length ? [{ salesOrderNumber: { in: visibleSalesOrderNumbers } }] : []),
    ]

    // Only load fulfillment records belonging to orders visible to this user.
    const packages = await prisma.package.findMany({
      where: fulfillmentScope.length ? { OR: fulfillmentScope } : { id: { in: [] } },
      take: 1000,
      orderBy: { date: "desc" },
    })

    // Fetch all purchase orders (not just dropshipments -- the flag isn't reliably set)
    const allPurchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        status: { notIn: ['cancelled', 'void'] },
        ...(fulfillmentScope.length ? {
          OR: [
            ...fulfillmentScope,
            ...(visibleSalesOrderNumbers.length ? [{ referenceNumber: { in: visibleSalesOrderNumbers } }] : []),
          ],
        } : { id: { in: [] } }),
      },
      take: 2000,
      orderBy: { date: "desc" },
    })

    // Build maps of packages by salesOrderId
    const packagesBySOId = new Map<string, any[]>()
    for (const pkg of packages) {
      const soId = pkg.salesOrderId || ""
      if (!packagesBySOId.has(soId)) packagesBySOId.set(soId, [])
      packagesBySOId.get(soId)!.push(pkg)
    }
    const packagesBySONumber = new Map<string, any[]>()
    for (const pkg of packages) {
      const soNum = pkg.salesOrderNumber || ""
      if (soNum) {
        if (!packagesBySONumber.has(soNum)) packagesBySONumber.set(soNum, [])
        packagesBySONumber.get(soNum)!.push(pkg)
      }
    }

    // Build maps of POs by salesOrderId, salesOrderNumber, AND referenceNumber
    const dropshipsBySOId = new Map<string, any[]>()
    const dropshipsBySONumber = new Map<string, any[]>()
    for (const po of allPurchaseOrders) {
      const soId = po.salesOrderId || ""
      if (soId) {
        if (!dropshipsBySOId.has(soId)) dropshipsBySOId.set(soId, [])
        dropshipsBySOId.get(soId)!.push(po)
      }
      // Match by salesOrderNumber
      const soNum = po.salesOrderNumber || ""
      if (soNum) {
        if (!dropshipsBySONumber.has(soNum)) dropshipsBySONumber.set(soNum, [])
        dropshipsBySONumber.get(soNum)!.push(po)
      }
      // Also try referenceNumber as a fallback SO number match
      const refNum = po.referenceNumber || ""
      if (refNum && refNum !== soNum) {
        if (!dropshipsBySONumber.has(refNum)) dropshipsBySONumber.set(refNum, [])
        dropshipsBySONumber.get(refNum)!.push(po)
      }
    }

    // Collect all available Salespersons and Carriers for UI dropdowns
    const salespersonsSet = new Set<string>()
    const carriersSet = new Set<string>()

    // Enrich each SO with shipping status
    let results = salesOrders.map(so => {
      const items = (so.items as any) || {}
      const soNumber = items.salesOrderNumber || items.salesorder_number || so.zohoId || ""
      const soZohoId = so.zohoId || ""
      const salesperson = items.salesperson || items.salesperson_name || items.salespersonName || "Unknown"

      if (salesperson && salesperson !== "Unknown") salespersonsSet.add(salesperson)

      // Find packages and dropshipments for this SO
      const soPkgs = packagesBySOId.get(soZohoId) || packagesBySONumber.get(soNumber) || []
      const soDrops = dropshipsBySOId.get(soZohoId) || dropshipsBySONumber.get(soNumber) || []

      soPkgs.forEach((p: any) => { if (p.carrier) carriersSet.add(p.carrier) })

      const hasFulfillment = soPkgs.length > 0 || soDrops.length > 0

      const rawLines = items.line_items || items.lineItems || items._zohoRaw?.line_items || []
      const isFullyDropshipped = rawLines.length > 0 && rawLines.every((li: any) => {
        if (li.product_type === "service" || li.line_item_type === "service") return true
        const totalQty = parseFloat(li.quantity || 0)
        const dropshippedQty = parseFloat(li.quantity_dropshipped || 0)
        return dropshippedQty >= totalQty
      })

      // Derive shipping status considering both packages AND dropshipments
      let shipStatus: "needs_packaging" | "packaged" | "shipped" | "delivered" = "needs_packaging"
      
      if (isFullyDropshipped) {
        const allDropDelivered = soDrops.length > 0 && soDrops.every((po: any) =>
          po.status?.toLowerCase() === "received" || po.status?.toLowerCase() === "delivered" || po.status?.toLowerCase() === "billed"
        )
        shipStatus = allDropDelivered ? "delivered" : "shipped"
      } else if (hasFulfillment) {
        // Check packages
        const allPkgDelivered = soPkgs.length === 0 || soPkgs.every((p: any) => p.status?.toLowerCase() === "delivered")
        const anyPkgShipped = soPkgs.some((p: any) =>
          p.trackingNumber || p.status?.toLowerCase() === "shipped" || p.status?.toLowerCase() === "delivered"
        )

        // Check dropshipments -- PO statuses: draft, issued, received, billed, cancelled
        const allDropDelivered = soDrops.length === 0 || soDrops.every((po: any) =>
          po.status?.toLowerCase() === "received" || po.status?.toLowerCase() === "delivered" || po.status?.toLowerCase() === "billed"
        )
        const anyDropShipped = soDrops.some((po: any) =>
          po.status?.toLowerCase() === "issued" || po.status?.toLowerCase() === "received" ||
          po.status?.toLowerCase() === "billed" || po.trackingNumber
        )

        const allDelivered = allPkgDelivered && allDropDelivered
        const anyShipped = anyPkgShipped || anyDropShipped

        if (allDelivered && hasFulfillment) shipStatus = "delivered"
        else if (anyShipped) shipStatus = "shipped"
        else shipStatus = "packaged"
      }

      // Extract shipping address: Zoho Books format → items JSON → billing address → Account fallback
      const zohoShipAddr = items.shipping_address
      const zohoBillAddr = items.billing_address
      let shippingAddress: any = null
      if (zohoShipAddr && typeof zohoShipAddr === 'object' && (zohoShipAddr.address || zohoShipAddr.city)) {
        shippingAddress = {
          address: [zohoShipAddr.address, zohoShipAddr.street2].filter(Boolean).join(', '),
          city: zohoShipAddr.city || '',
          state: zohoShipAddr.state || zohoShipAddr.state_code || '',
          zip: zohoShipAddr.zip || zohoShipAddr.zipcode || '',
          country: zohoShipAddr.country || zohoShipAddr.country_code || 'US',
        }
      } else if (items.shippingAddress && typeof items.shippingAddress === 'object') {
        shippingAddress = items.shippingAddress
      } else if (zohoBillAddr && typeof zohoBillAddr === 'object' && (zohoBillAddr.address || zohoBillAddr.city)) {
        // Fallback to billing address if no shipping address
        shippingAddress = {
          address: [zohoBillAddr.address, zohoBillAddr.street2].filter(Boolean).join(', '),
          city: zohoBillAddr.city || '',
          state: zohoBillAddr.state || zohoBillAddr.state_code || '',
          zip: zohoBillAddr.zip || zohoBillAddr.zipcode || '',
          country: zohoBillAddr.country || zohoBillAddr.country_code || 'US',
        }
      } else if (so.account?.shippingStreet) {
        shippingAddress = {
          address: so.account.shippingStreet,
          city: so.account.shippingCity || '',
          state: so.account.shippingState || '',
          zip: so.account.shippingZip || '',
        }
      } else if (so.account?.billingStreet) {
        shippingAddress = {
          address: so.account.billingStreet,
          city: so.account.billingCity || '',
          state: so.account.billingState || '',
          zip: so.account.billingZip || '',
        }
      }

      // Line items
      const lineItems = items.line_items || items.lineItems || items._zohoRaw?.line_items || []
      const dcBreakdown = items.itemsDcBreakdown || []
      
      let lineItemCount = 0
      let lineItemNames: string[] = []
      let mappedLineItems: any[] = []
      
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        const filteredLines = financialZohoLineItems(lineItems).map(li => {
          const totalQty = parseFloat(li.quantity || 0)
          const dropshippedQty = parseFloat(li.quantity_dropshipped || 0)
          const remainingQty = Math.max(0, totalQty - dropshippedQty)
          return {
            name: li.name || li.itemName || li.item_name || "",
            sku: li.sku || li.sku_code || "",
            quantity: remainingQty
          }
        }).filter((li: any) => li.quantity > 0)

        lineItemCount = filteredLines.length
        lineItemNames = filteredLines.slice(0, 3).map((li: any) => li.name).filter(Boolean)
        mappedLineItems = filteredLines
      } else if (Array.isArray(dcBreakdown) && dcBreakdown.length > 0) {
        lineItemCount = dcBreakdown.length
        lineItemNames = dcBreakdown.slice(0, 3).map((str: string) => str.split('|')[0].trim())
        mappedLineItems = dcBreakdown.map((str: string) => {
          const parts = str.split('|')
          const firstPart = parts[0].trim()
          const match = firstPart.match(/^(\d+)x\s+(.*)$/)
          if (match) {
            return {
              name: match[2].trim(),
              sku: match[2].trim(),
              quantity: parseFloat(match[1])
            }
          }
          return {
            name: firstPart,
            sku: firstPart,
            quantity: 1
          }
        })
      }

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
        lineItems: mappedLineItems,
        salesperson,
        shippingCost: so.actualShippingCost || 0,
        packages: soPkgs.map((p: any) => {
          const pkgItems = (p.items as any) || {}
          return {
            id: p.id,
            zohoId: p.zohoId,
            packageNumber: p.packageNumber,
            date: p.date,
            status: p.status,
            carrier: p.carrier,
            trackingNumber: p.trackingNumber,
            shippingCharge: p.shippingCharge || pkgItems.easyshipCost || 0,
            items: p.items,
            salesOrderNumber: soNumber,
            easyshipShipmentId: pkgItems.easyshipShipmentId || null,
          }
        }),
        dropshipments: soDrops.map((po: any) => {
          const poItems = (po.items as any) || {}
          const lineItems = poItems.line_items || poItems.lineItems || []
          return {
            id: po.id,
            zohoId: po.zohoId,
            vendorName: po.vendorName,
            shipToName: po.shipToName,
            referenceNumber: po.referenceNumber,
            date: po.date,
            total: po.total,
            status: po.status,
            trackingNumber: po.trackingNumber,
            shippingCharge: poItems.shipping_charge || 0,
            lineItems: financialZohoLineItems(lineItems).map(li => ({
              name: li.name || li.item_name || li.description || '',
              sku: li.sku || '',
              quantity: li.quantity || 1,
              rate: li.rate || 0,
            })),
          }
        }),
      }
    })

    // Apply search filter
    if (search) {
      const s = search.toLowerCase()
      results = results.filter(r =>
        r.soNumber.toLowerCase().includes(s) ||
        r.customerName.toLowerCase().includes(s) ||
        r.salesperson.toLowerCase().includes(s) ||
        r.lineItems?.some((li: any) =>
          (li.name || '').toLowerCase().includes(s) ||
          (li.sku || '').toLowerCase().includes(s)
        ) ||
        r.lineItemNames?.some((n: string) => n.toLowerCase().includes(s)) ||
        r.packages?.some((p: any) =>
          (p.trackingNumber || '').toLowerCase().includes(s) ||
          (p.carrier || '').toLowerCase().includes(s)
        ) ||
        r.dropshipments?.some((d: any) =>
          (d.vendorName || '').toLowerCase().includes(s)
        )
      )
    }


    // Apply Salesperson filter (for Admin view)
    if (isAdmin && salespersonFilter) {
      results = results.filter(r => r.salesperson.toLowerCase() === salespersonFilter.toLowerCase())
    }

    // Apply Carrier filter
    if (carrierFilter) {
      results = results.filter(r =>
        r.packages.some((p: any) => p.carrier?.toLowerCase() === carrierFilter.toLowerCase())
      )
    }

    // Calculate Status counts across all tabs BEFORE filtering by active tab status
    const counts = {
      all: results.length,
      needs_packaging: results.filter(r => r.shipStatus === "needs_packaging").length,
      packaged: results.filter(r => r.shipStatus === "packaged").length,
      shipped: results.filter(r => r.shipStatus === "shipped").length,
      delivered: results.filter(r => r.shipStatus === "delivered").length,
    }

    // Apply active tab status filter
    if (status !== "all") {
      results = results.filter(r => r.shipStatus === status)
    }

    // Apply Sorting
    results.sort((a, b) => {
      let valA: any = a.orderDate
      let valB: any = b.orderDate

      if (sortBy === "amount") {
        valA = a.amount || 0
        valB = b.amount || 0
      } else if (sortBy === "customer") {
        valA = a.customerName.toLowerCase()
        valB = b.customerName.toLowerCase()
      } else if (sortBy === "soNumber") {
        valA = a.soNumber.toLowerCase()
        valB = b.soNumber.toLowerCase()
      }

      if (valA < valB) return sortDir === "asc" ? -1 : 1
      if (valA > valB) return sortDir === "asc" ? 1 : -1
      return 0
    })

    // Pagination
    const total = results.length
    const paginated = results.slice((page - 1) * pageSize, page * pageSize)

    const freshness = await getDatabaseFreshness()
    return NextResponse.json({
      success: true,
      data: paginated,
      total,
      page,
      pageSize,
      counts,
      isAdmin,
      availableSalespersons: Array.from(salespersonsSet).sort(),
      availableCarriers: Array.from(carriersSet).sort(),
      freshness,
    }, { headers: databaseReadHeaders(startedAt, 4) })
  } catch (err: any) {
    console.error("shipping GET error:", err)
    return NextResponse.json({ success: false, data: [], error: LOCAL_DATA_INCOMPLETE }, {
      status: 500,
      headers: databaseReadHeaders(startedAt, 0),
    })
  }
}
