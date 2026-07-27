import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const params = event.queryStringParameters || {}
    const status = params.status || "all"
    const search = params.search || ""
    const salespersonFilter = params.salesperson || ""
    const carrierFilter = params.carrier || ""
    const sortBy = params.sortBy || "orderDate"
    const sortDir = params.sortDir || "desc"
    const page = parseInt(params.page || "1")
    const limit = parseInt(params.limit || "100")

    if (event.httpMethod === "PUT") {
      const body = JSON.parse(event.body || "{}")
      const { action, packageId, carrier, trackingNumber } = body

      if (!packageId) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing packageId" }) }
      }

      const pkg = await prisma.package.findUnique({ where: { id: packageId } })
      if (!pkg) {
        return { statusCode: 404, headers: cors, body: JSON.stringify({ error: "Package not found" }) }
      }

      let updatedData: any = {}
      if (action === "addTracking") {
        updatedData = { carrier: carrier || pkg.carrier, trackingNumber: trackingNumber || pkg.trackingNumber, status: "shipped" }
      } else if (action === "markShipped") {
        updatedData = { status: "shipped" }
      } else if (action === "markDelivered") {
        updatedData = { status: "delivered" }
      }

      const updated = await prisma.package.update({
        where: { id: packageId },
        data: updatedData,
      })

      // Push tracking & shipment status to Zoho Books API
      if (pkg.zohoId && (trackingNumber || carrier)) {
        try {
          const { getZohoAccessToken } = require("./lib/zoho-auth")
          const token = await getZohoAccessToken()
          const ZOHO_DC = process.env.ZOHO_DC || 'com'
          const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'

          await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/shipmentorders?organization_id=${ORG_ID}`, {
            method: "POST",
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              package_ids: pkg.zohoId,
              tracking_number: trackingNumber || pkg.trackingNumber || "",
              shipping_carrier: carrier || pkg.carrier || "",
              date: new Date().toISOString().split("T")[0]
            })
          })
        } catch (zohoErr: any) {
          console.error("Failed to push tracking to Zoho Books:", zohoErr.message)
        }
      }

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, package: updated }) }
    }

    // GET Request
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

    const packages = await prisma.package.findMany({
      take: 1000,
      orderBy: { date: "desc" },
    })

    const dropshipPOs = await prisma.purchaseOrder.findMany({
      where: { isDropshipment: true },
      take: 1500,
      orderBy: { date: "desc" },
    })

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

    const dropshipsBySOId = new Map<string, any[]>()
    for (const po of dropshipPOs) {
      const soId = po.salesOrderId || ""
      if (soId) {
        if (!dropshipsBySOId.has(soId)) dropshipsBySOId.set(soId, [])
        dropshipsBySOId.get(soId)!.push(po)
      }
    }
    const dropshipsBySONumber = new Map<string, any[]>()
    for (const po of dropshipPOs) {
      const soNum = po.salesOrderNumber || ""
      if (soNum) {
        if (!dropshipsBySONumber.has(soNum)) dropshipsBySONumber.set(soNum, [])
        dropshipsBySONumber.get(soNum)!.push(po)
      }
    }

    const salespersonsSet = new Set<string>()
    const carriersSet = new Set<string>()

    let results = salesOrders.map(so => {
      const items = (so.items as any) || {}
      const soNumber = items.salesOrderNumber || items.salesorder_number || so.zohoId || ""
      const soZohoId = so.zohoId || ""
      const salesperson = items.salesperson || items.salesperson_name || items.salespersonName || "Unknown"

      if (salesperson && salesperson !== "Unknown") salespersonsSet.add(salesperson)

      const soPkgs = packagesBySOId.get(soZohoId) || packagesBySONumber.get(soNumber) || []
      const soDrops = dropshipsBySOId.get(soZohoId) || dropshipsBySONumber.get(soNumber) || []

      soPkgs.forEach((p: any) => { if (p.carrier) carriersSet.add(p.carrier) })

      const hasFulfillment = soPkgs.length > 0 || soDrops.length > 0
      let shipStatus: "needs_packaging" | "packaged" | "shipped" | "delivered" = "needs_packaging"
      
      if (hasFulfillment) {
        const allPkgDelivered = soPkgs.length === 0 || soPkgs.every((p: any) => p.status?.toLowerCase() === "delivered")
        const anyPkgShipped = soPkgs.some((p: any) =>
          p.trackingNumber || p.status?.toLowerCase() === "shipped" || p.status?.toLowerCase() === "delivered"
        )
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

      const shippingAddress = items.shipping_address || items.shippingAddress || (so.account?.shippingStreet ? {
        address: so.account.shippingStreet,
        city: so.account.shippingCity,
        state: so.account.shippingState,
        zip: so.account.shippingZip
      } : null)

      const lineItems = items.line_items || items.lineItems || []
      const dcBreakdown = items.itemsDcBreakdown || []
      
      let lineItemCount = 0
      let lineItemNames: string[] = []
      
      if (Array.isArray(lineItems) && lineItems.length > 0) {
        lineItemCount = lineItems.length
        lineItemNames = lineItems.slice(0, 3).map((li: any) => li.name || li.itemName || "").filter(Boolean)
      } else if (Array.isArray(dcBreakdown) && dcBreakdown.length > 0) {
        lineItemCount = dcBreakdown.length
        lineItemNames = dcBreakdown.slice(0, 3).map((str: string) => str.split('|')[0].trim())
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
        salesperson,
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
        dropshipments: soDrops.map((po: any) => ({
          id: po.id,
          zohoId: po.zohoId,
          vendorName: po.vendorName,
          date: po.date,
          total: po.total,
          status: po.status,
          trackingNumber: po.trackingNumber,
        })),
      }
    })

    if (search) {
      const s = search.toLowerCase()
      results = results.filter(r =>
        r.soNumber.toLowerCase().includes(s) ||
        r.customerName.toLowerCase().includes(s) ||
        r.salesperson.toLowerCase().includes(s)
      )
    }

    if (salespersonFilter) {
      results = results.filter(r => r.salesperson.toLowerCase() === salespersonFilter.toLowerCase())
    }

    if (carrierFilter) {
      results = results.filter(r =>
        r.packages.some((p: any) => p.carrier?.toLowerCase() === carrierFilter.toLowerCase())
      )
    }

    if (status !== "all") {
      results = results.filter(r => r.shipStatus === status)
    }

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

    const total = results.length
    const paginated = results.slice((page - 1) * limit, page * limit)

    const counts = {
      all: results.length,
      needs_packaging: results.filter(r => r.shipStatus === "needs_packaging").length,
      packaged: results.filter(r => r.shipStatus === "packaged").length,
      shipped: results.filter(r => r.shipStatus === "shipped").length,
      delivered: results.filter(r => r.shipStatus === "delivered").length,
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        data: paginated,
        total,
        page,
        limit,
        counts,
        isAdmin: true,
        availableSalespersons: Array.from(salespersonsSet).sort(),
        availableCarriers: Array.from(carriersSet).sort(),
      })
    }
  } catch (err: any) {
    console.error("shipping Netlify function error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message })
    }
  }
}
