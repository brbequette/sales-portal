import { withFunctionAuth } from "./lib/auth-middleware"
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
    const { accountId } = event.queryStringParameters || {}

    if (!accountId) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: false, error: "Missing accountId parameter" })
      }
    }

    // 1. Get the account
    const account = await prisma.account.findFirst({
      where: { OR: [{ id: accountId }, { zohoId: accountId }] },
      select: { id: true, name: true },
    })

    if (!account) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ success: false, error: "Account not found" })
      }
    }

    // Reads must remain local-first. Background/webhook sync is responsible for
    // keeping line_items current; opening an account never calls Zoho.
    const updatedInvoices = await prisma.invoice.findMany({
      where: {
        accountId: account.id,
        status: { notIn: ["void", "voided", "draft", "cancelled", "canceled"], mode: "insensitive" },
      },
      select: { items: true, issueDate: true },
    })

    const purchaseSummaryMap = new Map<string, {
      sku: string
      name: string
      quantity: number
      totalSpend: number
      lastPurchaseDate: string | null
    }>()

    for (const inv of updatedInvoices) {
      const items = inv.items as any
      const lineItems = items?.line_items
      const issueDate = inv.issueDate ? new Date(inv.issueDate).toISOString() : null
      
      if (Array.isArray(lineItems)) {
        for (const line of lineItems) {
          const sku = line.sku || "N/A"
          const name = line.name || line.description || "Unknown Item"
          const qty = parseFloat(line.quantity || 0)
          const total = parseFloat(line.item_total || (parseFloat(line.rate || 0) * qty) || 0)

          const key = sku !== "N/A" ? sku : name
          const existing = purchaseSummaryMap.get(key)
          if (existing) {
            existing.quantity += qty
            existing.totalSpend += total
            if (issueDate && (!existing.lastPurchaseDate || new Date(issueDate) > new Date(existing.lastPurchaseDate))) {
              existing.lastPurchaseDate = issueDate
            }
          } else {
            purchaseSummaryMap.set(key, {
              sku,
              name,
              quantity: qty,
              totalSpend: total,
              lastPurchaseDate: issueDate
            })
          }
        }
      }
    }

    const purchasedProducts = Array.from(purchaseSummaryMap.values())
      .filter(item => item.quantity > 0)
      .sort((a, b) => b.totalSpend - a.totalSpend)

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, purchasedProducts })
    }

  } catch (error: any) {
    console.error("get-account-purchases error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
