import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

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
    const account = await prisma.account.findUnique({
      where: { zohoId: accountId },
      include: { invoices: true }
    })

    if (!account) {
      return {
        statusCode: 404,
        headers: cors,
        body: JSON.stringify({ success: false, error: "Account not found" })
      }
    }

    // 2. Identify invoices that need line items cached
    const invoicesToSync = account.invoices.filter(inv => {
      const items = inv.items as any
      return !items?.line_items || !Array.isArray(items.line_items) || items.line_items.length === 0
    })

    if (invoicesToSync.length > 0) {
      try {
        console.log(`Syncing line items for ${invoicesToSync.length} invoices of account ${account.name}...`)
        const token = await getZohoAccessToken()
        const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

        // Fetch invoice details from Zoho Books and update DB
        // Limit concurrency to 5 at a time
        const chunk = <T>(arr: T[], size: number): T[][] =>
          Array.from({ length: Math.ceil(arr.length / size) }, (v, i) =>
            arr.slice(i * size, i * size + size)
          )

        const chunks = chunk(invoicesToSync, 5)
        for (const batch of chunks) {
          await Promise.all(batch.map(async (inv) => {
            const items = inv.items as any
            const booksInvoiceId = items?.booksInvoiceId
            if (!booksInvoiceId) return

            try {
              const zohoRes = await fetch(`${baseUrl}/invoices/${booksInvoiceId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
                headers: { Authorization: `Zoho-oauthtoken ${token}` },
              })
              if (zohoRes.ok) {
                const zohoData = await zohoRes.json()
                if (zohoData.code === 0 && zohoData.invoice) {
                  const zohoInvoice = zohoData.invoice
                  const currentItems = {
                    ...items,
                    line_items: zohoInvoice.line_items || [],
                    custom_fields: zohoInvoice.custom_fields || items?.custom_fields,
                    balance: zohoInvoice.balance ?? items?.balance,
                  }
                  await prisma.invoice.update({
                    where: { id: inv.id },
                    data: { items: currentItems }
                  })
                }
              }
            } catch (err: any) {
              console.warn(`Failed to sync invoice details for ${inv.zohoId}:`, err.message)
            }
          }))
        }
      } catch (syncErr: any) {
        console.warn("Failed to complete line items sync from Zoho:", syncErr.message)
      }
    }

    // 3. Fetch all invoices again from database to compile line items
    const updatedInvoices = await prisma.invoice.findMany({
      where: { accountId: account.id }
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
