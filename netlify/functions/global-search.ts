import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"
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
    const sessionUser = await authenticateFunction(event)
    const ownerId = sessionUser.dbId || sessionUser.userId
    const restrictToOwner = !isAdminRole(sessionUser.role)
    if (restrictToOwner && !ownerId) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "User identity is not linked" }) }
    }
    const { q } = event.queryStringParameters || {}
    if (!q || q.length < 1) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, results: {} }) }
    }

    const query = q.toLowerCase()

    // 1. Search Accounts (Prisma)
    const accounts = await prisma.account.findMany({
      where: {
        AND: [
          ...(restrictToOwner ? [{ ownerId }] : []),
          { OR: [
            { name: { contains: query, mode: "insensitive" } },
            { zohoId: { contains: query } },
            { tags: { contains: query, mode: "insensitive" } },
            { industry: { contains: query, mode: "insensitive" } }
          ] },
        ]
      },
      take: 10
    })

    // 2. Search Invoices (Prisma)
    let invoices: any[] = []
    try {
      invoices = await prisma.invoice.findMany({
        where: {
          AND: [
            ...(restrictToOwner ? [{ account: { ownerId } }] : []),
            { OR: [
              { zohoId: { contains: query } },
              { status: { contains: query, mode: "insensitive" } },
              { items: { path: ['invoiceNumber'], string_contains: query } },
              { items: { path: ['invoice_number'], string_contains: query } },
            ] },
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
            AND: [
              ...(restrictToOwner ? [{ account: { ownerId } }] : []),
              { OR: [
                { zohoId: { contains: query } },
                { status: { contains: query, mode: "insensitive" } }
              ] },
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
    const dealsRaw = await prisma.deal.findMany({
      where: {
        AND: [
          ...(restrictToOwner ? [{ ownerId }] : []),
          { OR: [
            { name: { contains: query, mode: "insensitive" } },
            { zohoId: { contains: query } },
            { stage: { contains: query, mode: "insensitive" } }
          ] },
        ]
      },
      include: { account: { select: { name: true, zohoId: true } } },
      take: 10
    })
    const deals = dealsRaw.map((d: any) => ({
      ...d,
      accountName: d.account?.name,
      accountZohoId: d.account?.zohoId,
    }))

    // 4. Search Products (Prisma)
    let products: any[] = []
    try {
      const dbProducts = await prisma.product.findMany({
        where: {
          OR: [
            { name: { contains: query, mode: 'insensitive' } },
            { sku: { contains: query, mode: 'insensitive' } },
          ]
        },
        take: 10,
        select: { id: true, name: true, sku: true, price: true }
      })
      products = dbProducts.map((p: any) => ({
        type: 'product',
        id: p.id,
        name: p.name,
        sku: p.sku || "N/A",
        rate: p.price,
        price: p.price,
        category: "Uncategorized",
        stock: 0,
        description: ""
      }))
    } catch (e) {
      console.warn("Product search failed:", e)
    }

    // 5. Search Quotes (Prisma)
    let quotes: any[] = []
    try {
      quotes = await prisma.quote.findMany({
        where: {
          AND: [
            ...(restrictToOwner ? [{ account: { ownerId } }] : []),
            { OR: [
              { zohoId: { contains: query } },
              { status: { contains: query, mode: "insensitive" } },
              { items: { path: ['estimateNumber'], string_contains: query } },
              { items: { path: ['estimate_number'], string_contains: query } },
            ] },
          ]
        },
        include: { account: { select: { name: true } } },
        take: 10
      })
    } catch (e) {
      console.warn("Quote search failed, attempting fallback query:", e)
      try {
        quotes = await prisma.quote.findMany({
          where: {
            AND: [
              ...(restrictToOwner ? [{ account: { ownerId } }] : []),
              { OR: [
                { zohoId: { contains: query } },
                { status: { contains: query, mode: "insensitive" } }
              ] },
            ]
          },
          include: { account: { select: { name: true } } },
          take: 10
        })
      } catch (fallbackErr) {
        console.error("Quote fallback query failed:", fallbackErr)
      }
    }

    // 6. Search Sales Orders (Prisma)
    let salesOrders: any[] = []
    try {
      salesOrders = await prisma.salesOrder.findMany({
        where: {
          AND: [
            ...(restrictToOwner ? [{ account: { ownerId } }] : []),
            { OR: [
              { zohoId: { contains: query } },
              { status: { contains: query, mode: "insensitive" } },
              { items: { path: ['salesOrderNumber'], string_contains: query } },
              { items: { path: ['salesorder_number'], string_contains: query } },
            ] },
          ]
        },
        include: { account: { select: { name: true } } },
        take: 10
      })
    } catch (e) {
      console.warn("SalesOrder search failed, attempting fallback query:", e)
      try {
        salesOrders = await prisma.salesOrder.findMany({
          where: {
            AND: [
              ...(restrictToOwner ? [{ account: { ownerId } }] : []),
              { OR: [
                { zohoId: { contains: query } },
                { status: { contains: query, mode: "insensitive" } }
              ] },
            ]
          },
          include: { account: { select: { name: true } } },
          take: 10
        })
      } catch (fallbackErr) {
        console.error("SalesOrder fallback query failed:", fallbackErr)
      }
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

export const handler = withFunctionAuth(authenticatedHandler)
