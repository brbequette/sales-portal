import { Handler } from "@netlify/functions"
import { getZohoAccessToken as getAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
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

  if (!['Quote', 'SalesOrder'].includes(type)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid type. Must be Quote or SalesOrder" }) }
  }

  try {
    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    let booksId = documentId

    if (type === 'Quote') {
      const dbQuote = await prisma.quote.findFirst({
        where: {
          OR: [
            { id: documentId },
            { zohoId: documentId }
          ]
        }
      })
      if (dbQuote) {
        const items = dbQuote.items as any
        if (items?.booksEstimateId) {
          booksId = items.booksEstimateId
        }
      }

      const res = await fetch(`${baseUrl}/estimates/${booksId}/email?organization_id=${ORG_ID}`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data: any = await res.json()
      if (data.code !== 0 && data.code !== 100000) {
        throw new Error(`Zoho error: ${data.message || 'Failed to email quote'}`)
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
        const items = dbSalesOrder.items as any
        if (items?.booksSalesOrderId) {
          booksId = items.booksSalesOrderId
        }
      }

      const res = await fetch(`${baseUrl}/salesorders/${booksId}/email?organization_id=${ORG_ID}`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data: any = await res.json()
      if (data.code !== 0 && data.code !== 100000) {
        throw new Error(`Zoho error: ${data.message || 'Failed to email sales order'}`)
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true }),
    }
  } catch (err: any) {
    console.error('zoho-send-document error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
