import { Handler } from "@netlify/functions"
import { getZohoAccessToken as getAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  let body: any = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) }
  }

  const { documentId, type } = body
  if (!documentId || !type) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing documentId or type" }) }
  }

  if (!['Invoice', 'SalesOrder', 'Quote'].includes(type)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid type. Must be Invoice, SalesOrder, or Quote" }) }
  }

  try {
    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    let booksId = documentId
    let dbRecord: any = null

    if (type === 'Invoice') {
      const dbInvoice = await prisma.invoice.findFirst({
        where: {
          OR: [
            { id: documentId },
            { zohoId: documentId }
          ]
        }
      })
      if (dbInvoice) {
        dbRecord = dbInvoice
        const items = dbInvoice.items as any
        if (items?.booksInvoiceId) {
          booksId = items.booksInvoiceId
        }
      }

      const res = await fetch(`${baseUrl}/invoices/${booksId}/status/void?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data: any = await res.json()
      if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to void invoice'}`)

      if (dbRecord) {
        await prisma.invoice.update({
          where: { id: dbRecord.id },
          data: { status: 'void' }
        })
      }
    } else if (type === 'SalesOrder') {
      const dbSalesOrder = await prisma.salesOrder.findFirst({
        where: {
          OR: [
            { id: documentId },
            { zohoId: documentId }
          ]
        }
      })
      if (dbSalesOrder) {
        dbRecord = dbSalesOrder
        const items = dbSalesOrder.items as any
        if (items?.booksSalesOrderId) {
          booksId = items.booksSalesOrderId
        }
      }

      const res = await fetch(`${baseUrl}/salesorders/${booksId}/status/void?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data: any = await res.json()
      if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to void sales order'}`)

      if (dbRecord) {
        await prisma.salesOrder.update({
          where: { id: dbRecord.id },
          data: { status: 'void' }
        })
      }
    } else if (type === 'Quote') {
      const dbQuote = await prisma.quote.findFirst({
        where: {
          OR: [
            { id: documentId },
            { zohoId: documentId }
          ]
        }
      })
      if (dbQuote) {
        dbRecord = dbQuote
        const items = dbQuote.items as any
        if (items?.booksEstimateId) {
          booksId = items.booksEstimateId
        }
      }

      const res = await fetch(`${baseUrl}/estimates/${booksId}/status/declined?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data: any = await res.json()
      if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to decline quote'}`)

      if (dbRecord) {
        await prisma.quote.update({
          where: { id: dbRecord.id },
          data: { status: 'declined' }
        })
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true }),
    }
  } catch (err: any) {
    console.error('zoho-void error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
