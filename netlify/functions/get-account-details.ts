import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { id } = event.queryStringParameters || {}

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing id parameter" })
      }
    }

    let account: any = null;

    // 1. Try finding by zohoId
    try {
      account = await prisma.account.findUnique({
        where: { zohoId: id },
        include: {
          invoices: { 
            orderBy: { issueDate: 'desc' } 
          },
          salesOrders: { orderBy: { orderDate: 'desc' } },
          quotes: { orderBy: { createdAt: 'desc' } },
          deals: { orderBy: { closingDate: 'desc' } },
          notes: { orderBy: { createdAt: 'desc' } },
          tasks: { orderBy: { dueDate: 'asc' } },
          contacts: true
        }
      })
    } catch (err: any) {
      console.warn("zohoId lookup failed:", err)
    }

    // 2. Fallback: find by internal DB id (CUID)
    if (!account) {
      try {
        account = await prisma.account.findUnique({
          where: { id: id },
          include: {
            invoices: { 
              orderBy: { issueDate: 'desc' } 
            },
            salesOrders: { orderBy: { orderDate: 'desc' } },
            quotes: { orderBy: { createdAt: 'desc' } },
            deals: { orderBy: { closingDate: 'desc' } },
            notes: { orderBy: { createdAt: 'desc' } },
            tasks: { orderBy: { dueDate: 'asc' } },
            contacts: true
          }
        })
      } catch (err: any) {
        console.warn("Internal id lookup failed (non-CUID id?):", err)
      }
    }

    if (!account) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, message: "Account not found" })
      }
    }

    // Enforce visibility restriction if caller parameters are supplied
    const { callerEmail, callerRole, callerDbId } = event.queryStringParameters || {}
    if (callerEmail) {
      const callerRoleLower = (callerRole || "").toLowerCase()
      const isAdmin = callerRoleLower.includes("admin") || callerRoleLower.includes("administrator")
      
      if (!isAdmin && account.ownerId !== callerDbId) {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ success: false, message: "Forbidden: You do not own this account." })
        }
      }
    }

    // Preserve the legacy UI shape from data already cached locally. This
    // avoids page-load Zoho calls while older components migrate to the
    // normalized Account and Contact fields.
    const raw = account.rawData && typeof account.rawData === "object" && !Array.isArray(account.rawData)
      ? account.rawData as Record<string, any>
      : {}
    const primaryContact = account.contacts.find((contact: any) => contact.isPrimary) || account.contacts[0]
    account.booksContact = {
      phone: primaryContact?.mobilePhone || primaryContact?.phone || raw.Phone || raw.phone || null,
      email: primaryContact?.email || raw.Email || raw.email || null,
      website: raw.Website || raw.website || null,
      notes: raw.Description || raw.description || null,
      billing_address: {
        address: account.billingStreet,
        city: account.billingCity,
        state: account.billingState,
        zip: account.billingZip,
      },
      shipping_address: {
        address: account.shippingStreet,
        city: account.shippingCity,
        state: account.shippingState,
        zip: account.shippingZip,
      },
    }

    // The account hub only needs document summaries for its initial render.
    // Full Zoho payloads (especially line_items and custom-field arrays) can
    // make established accounts several megabytes and delay parsing/rendering.
    const compact = (value: unknown, keys: string[]) => {
      const source = value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {}
      return Object.fromEntries(keys.filter(key => source[key] !== undefined).map(key => [key, source[key]]))
    }
    account.invoices = account.invoices.map((invoice: any) => ({
      ...invoice,
      items: compact(invoice.items, ['invoiceNumber', 'invoice_number', 'profit', 'salesCommission', 'commission']),
      rawData: undefined,
    }))
    account.salesOrders = account.salesOrders.map((order: any) => ({
      ...order,
      items: compact(order.items, ['salesOrderNumber', 'salesorder_number', 'date', 'salesorder_date']),
      rawData: undefined,
    }))
    account.quotes = account.quotes.map((quote: any) => ({
      ...quote,
      items: compact(quote.items, ['estimateNumber', 'estimate_number', 'quoteNumber', 'date', 'estimateDate']),
      rawData: undefined,
    }))
    account.deals = account.deals.map((deal: any) => ({ ...deal, rawData: undefined }))
    account.rawData = undefined

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "private, max-age=30, stale-while-revalidate=120",
      } as Record<string, string>,
      body: JSON.stringify({ success: true, account })
    }

  } catch (error: any) {
    console.error("Get Account Details Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
