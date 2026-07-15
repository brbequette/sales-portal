import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "GET") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const { q } = event.queryStringParameters || {}
    if (!q || q.length < 1) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, results: {} }) }
    }

    const query = q.toLowerCase()

    // 1. Search Accounts (Prisma)
    const accounts = await prisma.account.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { zohoId: { contains: query } },
          { tags: { contains: query, mode: "insensitive" } },
          { industry: { contains: query, mode: "insensitive" } }
        ]
      },
      take: 10
    })

    // 2. Search Invoices (Prisma)
    let invoices: any[] = []
    try {
      invoices = await prisma.invoice.findMany({
        where: {
          OR: [
            { zohoId: { contains: query } },
            { status: { contains: query, mode: "insensitive" } },
            {
              items: {
                path: ['invoiceNumber'],
                string_contains: query
              }
            },
            {
              items: {
                path: ['invoice_number'],
                string_contains: query
              }
            }
          ]
        },
        include: { account: { select: { name: true, zohoId: true } } },
        take: 10
      })
    } catch (e) {
      console.warn("Invoice search failed, attempting fallback query:", e)
      try {
        invoices = await prisma.invoice.findMany({
          where: {
            OR: [
              { zohoId: { contains: query } },
              { status: { contains: query, mode: "insensitive" } }
            ]
          },
          include: { account: { select: { name: true, zohoId: true } } },
          take: 10
        })
      } catch (fallbackErr) {
        console.error("Invoice fallback query failed:", fallbackErr)
      }
    }

    // 3. Search Deals (Prisma)
    const deals = await prisma.deal.findMany({
      where: {
        OR: [
          { name: { contains: query, mode: "insensitive" } },
          { zohoId: { contains: query } },
          { stage: { contains: query, mode: "insensitive" } }
        ]
      },
      take: 10
    })

    // 4. Search Products (Zoho Books)
    let products: any[] = []
    try {
      const token = await getZohoAccessToken()
      const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
      // Search items in Books
      const res = await fetch(`${baseUrl}/items?organization_id=${ORG_ID}&search_text=${encodeURIComponent(query)}&per_page=10`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const data = await res.json()
      if (data.items) {
        products = data.items.map((item: any) => ({
          id: item.item_id,
          sku: item.sku || "N/A",
          name: item.name || item.item_name,
          category: item.category_name || "Uncategorized",
          price: item.rate,
          stock: item.stock_on_hand || 0,
          description: item.description || ""
        }))
      }
    } catch (e) {
      console.warn("Product search failed:", e)
    }

    // 5. Search Quotes (Prisma)
    let quotes: any[] = []
    try {
      quotes = await prisma.quote.findMany({
        where: {
          OR: [
            { zohoId: { contains: query } },
            { status: { contains: query, mode: "insensitive" } },
          ]
        },
        include: { account: { select: { name: true } } },
        take: 10
      })
    } catch (e) {
      console.warn("Quote search failed:", e)
    }

    // 6. Search Sales Orders (Prisma)
    let salesOrders: any[] = []
    try {
      salesOrders = await prisma.salesOrder.findMany({
        where: {
          OR: [
            { zohoId: { contains: query } },
            { status: { contains: query, mode: "insensitive" } },
          ]
        },
        include: { account: { select: { name: true } } },
        take: 10
      })
    } catch (e) {
      console.warn("SalesOrder search failed:", e)
    }

    // Enrich invoices with invoiceNumber extracted from items JSON
    const enrichedInvoices = invoices.map((inv: any) => ({
      ...inv,
      invoiceNumber: inv.items?.invoiceNumber || inv.items?.invoice_number || null,
      accountName: inv.account?.name,
      accountZohoId: inv.account?.zohoId,
      docType: 'Invoice'
    }))

    // Merge quotes and sales orders into the invoices array for the global search results
    const enrichedQuotes = quotes.map((q: any) => ({
      ...q,
      invoiceNumber: q.items?.estimateNumber || q.items?.estimate_number || q.items?.quoteNumber || null,
      accountName: q.account?.name,
      docType: 'Quote'
    }))

    const enrichedSalesOrders = salesOrders.map((so: any) => ({
      ...so,
      invoiceNumber: so.items?.salesOrderNumber || so.items?.salesorder_number || null,
      accountName: so.account?.name,
      docType: 'SalesOrder'
    }))

    const allInvoices = [...enrichedInvoices, ...enrichedQuotes, ...enrichedSalesOrders]

    const results = {
      accounts,
      invoices: allInvoices,
      deals,
      products
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, results })
    }

  } catch (error: any) {
    console.error("Global search error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
