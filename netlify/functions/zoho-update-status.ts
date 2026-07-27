import { Handler } from "@netlify/functions"
import { getZohoAccessToken as getAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946';

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

  const { documentId, type, action, trackingNumber } = body
  if (!documentId || !type || !action) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing documentId, type, or action" }) }
  }

  if (!['SalesOrder', 'Quote'].includes(type)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid type. Must be SalesOrder or Quote" }) }
  }

  const validActions: Record<string, string[]> = {
    SalesOrder: ['confirm', 'shipped'],
    Quote: ['accepted', 'declined']
  }

  if (!validActions[type]?.includes(action)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: `Invalid action '${action}' for type '${type}'` }) }
  }

  try {
    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    let booksId = documentId
    let dbRecord: any = null

    if (type === 'SalesOrder') {
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

      if (action === 'confirm') {
        const res = await fetch(`${baseUrl}/salesorders/${booksId}/status/confirmed?organization_id=${ORG_ID}`, {
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          }
        })
        const data: any = await res.json()
        if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to confirm sales order'}`)
      } else if (action === 'shipped') {
        // Zoho Books does not have a dedicated /status/shipped endpoint.
        // Mark as shipped by updating the sales order with shipment tracking info.
        const updatePayload: any = {
          shipment_date: new Date().toISOString().split('T')[0],
          ...(trackingNumber ? { tracking_number: trackingNumber } : {})
        }
        const res = await fetch(`${baseUrl}/salesorders/${booksId}?organization_id=${ORG_ID}`, {
          method: 'PUT',
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify(updatePayload)
        })
        const data: any = await res.json()
        if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to update sales order shipment'}`)
      }

      if (dbRecord) {
        const statusMap: Record<string, string> = { confirm: 'confirmed', shipped: 'shipped' }
        await prisma.salesOrder.update({
          where: { id: dbRecord.id },
          data: { status: statusMap[action] || action }
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

      const res = await fetch(`${baseUrl}/estimates/${booksId}/status/${action}?organization_id=${ORG_ID}`, {
        method: 'POST',
        headers: {
          'Authorization': `Zoho-oauthtoken ${token}`,
          'Content-Type': 'application/json'
        }
      })
      const data: any = await res.json()
      if (data.code !== 0) throw new Error(`Zoho error: ${data.message || `Failed to ${action} quote`}`)

      if (dbRecord) {
        await prisma.quote.update({
          where: { id: dbRecord.id },
          data: { status: action }
        })
      }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true }),
    }
  } catch (err: any) {
    console.error('zoho-update-status error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message }),
    }
  }
}
