import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID

// GET -- Fetch all sales orders with their packages for the shipping center
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions)
    const role = (session?.user as any)?.role || "Sales Representative"
    const userName = session?.user?.name || ""
    const isAdmin = role.toLowerCase().includes("admin") || role.toLowerCase().includes("manager")

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
            shippingZip: true
          } 
        } 
      },
      orderBy: { orderDate: "desc" },
    })

    // RBAC: If not admin, restrict to rep's own orders
    if (!isAdmin && userName) {
      const lowerName = userName.toLowerCase()
      salesOrders = salesOrders.filter(so => {
        const items = (so.items as any) || {}
        const sp = (items.salesperson || items.salesperson_name || items.salespersonName || "").toLowerCase()
        return sp.includes(lowerName) || lowerName.includes(sp)
      })
    }

    // Fetch all packages
    const packages = await prisma.package.findMany({
      take: 1000,
      orderBy: { date: "desc" },
    })

    // Fetch all purchase orders (not just dropshipments -- the flag isn't reliably set)
    const allPurchaseOrders = await prisma.purchaseOrder.findMany({
      where: {
        status: { notIn: ['cancelled', 'void'] },
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
      const lineItems = items.line_items || items.lineItems || []
      const dcBreakdown = items.itemsDcBreakdown || []
      
      let lineItemCount = 0
      let lineItemNames: string[] = []
      let mappedLineItems: any[] = []
      
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        const filteredLines = lineItems.map((li: any) => {
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
            lineItems: lineItems.map((li: any) => ({
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
    })
  } catch (err: any) {
    console.error("shipping GET error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}

// PUT -- Update package tracking or status
export async function PUT(req: NextRequest) {
  try {
    const body = await req.json()
    const { action, packageId, carrier, trackingNumber, status, salesOrderId } = body

    if (action === "syncSalesOrder") {
      if (!salesOrderId) {
        return NextResponse.json({ error: "Missing salesOrderId" }, { status: 400 })
      }
      
      const token = await getZohoAccessToken()
      const ZOHO_DC = process.env.ZOHO_DC || "com"
      const url = `https://www.zohoapis.${ZOHO_DC}/books/v3/salesorders/${salesOrderId}?organization_id=${ORG_ID}`
      
      const res = await fetch(url, { signal: AbortSignal.timeout(15000),
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      if (!res.ok) {
        return NextResponse.json({ error: `Failed to fetch from Zoho: ${res.status}` }, { status: 500 })
      }
      const data = await res.json()
      if (data.code !== 0 || !data.salesorder) {
        return NextResponse.json({ error: data.message || "Failed to load SO from Zoho" }, { status: 500 })
      }
      
      const doc = data.salesorder
      const dbDoc = await prisma.salesOrder.findFirst({ where: { zohoId: salesOrderId } })
      const currentItems = dbDoc ? (dbDoc.items as any || {}) : {}
      
      const updatedItems = {
        ...currentItems,
        salesOrderNumber: doc.salesorder_number || currentItems.salesOrderNumber,
        sub_total: parseFloat(doc.sub_total || 0),
        balance: doc.balance ?? 0,
        shippingCharge: parseFloat(doc.shipping_charge || 0),
        customer_id: doc.customer_id || currentItems.customer_id,
        customer_name: doc.customer_name || currentItems.customer_name,
        shipping_address: doc.shipping_address || currentItems.shipping_address,
        billing_address: doc.billing_address || currentItems.billing_address,
        salesperson: doc.salesperson_name ? doc.salesperson_name.toUpperCase().trim() : currentItems.salesperson,
        line_items: doc.line_items || currentItems.line_items || [],
        custom_fields: doc.custom_fields || currentItems.custom_fields || [],
        lastSyncedAt: new Date().toISOString(),
      }
      
      if (dbDoc) {
        await prisma.salesOrder.update({
          where: { id: dbDoc.id },
          data: {
            amount: parseFloat(doc.sub_total || doc.total || 0),
            status: doc.status || dbDoc.status,
            items: updatedItems
          }
        })

        if (dbDoc.accountId && doc.shipping_address && (doc.shipping_address.address || doc.shipping_address.city)) {
          await prisma.account.update({
            where: { id: dbDoc.accountId },
            data: {
              shippingStreet: doc.shipping_address.address || doc.shipping_address.street2 || undefined,
              shippingCity: doc.shipping_address.city || undefined,
              shippingState: doc.shipping_address.state || undefined,
              shippingZip: doc.shipping_address.zip || undefined,
              billingStreet: doc.billing_address?.address || undefined,
              billingCity: doc.billing_address?.city || undefined,
              billingState: doc.billing_address?.state || undefined,
              billingZip: doc.billing_address?.zip || undefined,
            }
          }).catch((e: any) => console.warn('Account address update error:', e.message))
        }
      }
      
      return NextResponse.json({ success: true })
    }

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
