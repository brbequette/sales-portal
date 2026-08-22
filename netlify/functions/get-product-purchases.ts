import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const caller = await authenticateFunction(event)
    const { sku } = event.queryStringParameters || {}

    if (!sku) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: "Missing sku parameter" })
      }
    }

    const role = String(caller.role || "").toLowerCase()
    const privileged = role.includes("admin") || role.includes("manager")
    const callerId = String(caller.dbId || caller.userId || "")

    // JSON line-item matching still happens in memory, but non-privileged users
    // only load invoices belonging to accounts they own.
    const invoices = await prisma.invoice.findMany({
      where: privileged ? undefined : { account: { ownerId: callerId } },
      include: {
        account: {
          select: {
            name: true,
            zohoId: true
          }
        }
      },
      orderBy: {
        issueDate: "desc"
      }
    })

    const purchaseHistory: any[] = []

    for (const inv of invoices) {
      const items = inv.items as any
      const lineItems = items?.line_items
      if (Array.isArray(lineItems)) {
        for (const line of lineItems) {
          if (line.sku && line.sku.toLowerCase() === sku.toLowerCase()) {
            purchaseHistory.push({
              invoiceId: inv.id,
              zohoId: inv.zohoId,
              invoiceNumber: items?.invoiceNumber || inv.zohoId?.slice(-6) || "INV",
              date: inv.issueDate.toISOString().split("T")[0],
              accountId: inv.account?.zohoId || inv.accountId,
              accountName: inv.account?.name || "Unknown Account",
              quantity: parseFloat(line.quantity || 0),
              rate: parseFloat(line.rate || 0),
              total: parseFloat(line.item_total || (parseFloat(line.rate || 0) * parseFloat(line.quantity || 0)) || 0)
            })
          }
        }
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, purchaseHistory })
    }

  } catch (error: any) {
    console.error("get-product-purchases error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
