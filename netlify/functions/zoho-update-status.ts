import { Handler } from "@netlify/functions"
import { getZohoAccessToken as getAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { assertNoBooksConflictBeforeWrite } from "../../src/lib/sync-engine"
import { authorizeDocumentAccess } from "./lib/document-access"
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

  let sessionUser
  try {
    sessionUser = await authenticateFunction(event)
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  let body: any = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) }
  }

  const { documentId, type, action, trackingNumber, shippingMethod } = body
  if (!documentId || !type || !action) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing documentId, type, or action" }) }
  }

  if (!['Invoice', 'SalesOrder', 'Quote'].includes(type)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid document type" }) }
  }

  const validActions: Record<string, string[]> = {
    Invoice: ['sent'],
    SalesOrder: ['confirm', 'shipped'],
    Quote: ['accepted', 'declined']
  }

  if (!validActions[type]?.includes(action)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: `Invalid action '${action}' for type '${type}'` }) }
  }

  const documentKind = type === "Invoice" ? "invoice" : type === "SalesOrder" ? "salesOrder" : "quote"
  const access = await authorizeDocumentAccess(sessionUser, documentKind, { id: documentId })
  if (!access.authorized) {
    return { statusCode: 403, headers: cors, body: JSON.stringify({ error: "You can only update documents belonging to your accounts" }) }
  }

  try {
    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    let booksId = documentId
    let dbRecord: any = null

    if (type === 'Invoice') {
      const dbInvoice = await prisma.invoice.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      if (!dbInvoice) throw new Error('Invoice not found')
      await assertNoBooksConflictBeforeWrite('invoice', dbInvoice)
      booksId = dbInvoice.zohoId
      const res = await fetch(`${baseUrl}/invoices/${booksId}/status/sent?organization_id=${ORG_ID}`, {
        method: 'POST', headers: { Authorization: `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' }
      })
      const data: any = await res.json()
      if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to mark invoice sent'}`)
      await prisma.invoice.update({ where: { id: dbInvoice.id }, data: { status: 'sent', appModifiedAt: new Date(), lastSyncedAt: new Date() } })
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
        await assertNoBooksConflictBeforeWrite("salesorder", dbSalesOrder)
      }

      if (action === 'confirm') {
        const res = await fetch(`${baseUrl}/salesorders/${booksId}/status/confirmed?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          }
        })
        const data: any = await res.json()
        if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to confirm sales order'}`)
      } else if (action === 'shipped') {
        if (!trackingNumber) throw new Error('Tracking number is required to complete shipment')
        const updatePayload: any = {
          shipment_date: new Date().toISOString().split('T')[0],
          tracking_number: trackingNumber,
          ...(shippingMethod ? { delivery_method: shippingMethod } : {})
        }
        const res = await fetch(`${baseUrl}/salesorders/${booksId}?organization_id=${ORG_ID}`, {
          method: 'PUT',
          headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify(updatePayload)
        })
        const data: any = await res.json()
        if (data.code !== 0) throw new Error(`Zoho error: ${data.message || 'Failed to update sales order shipment'}`)

        const orderItems = (dbSalesOrder?.items as any) || {}
        const orderNumber = orderItems.salesOrderNumber || orderItems.salesorder_number || null
        const packages = await prisma.package.findMany({
          where: { OR: [{ salesOrderId: booksId }, ...(orderNumber ? [{ salesOrderNumber: orderNumber }] : [])] }
        })
        for (const pkg of packages) {
          if (pkg.zohoId) {
            const packageRes = await fetch(`${baseUrl}/packages/${pkg.zohoId}?organization_id=${ORG_ID}`, {
              method: 'PUT',
              headers: { 'Authorization': `Zoho-oauthtoken ${token}`, 'Content-Type': 'application/json' },
              body: JSON.stringify({ tracking_number: trackingNumber, ...(shippingMethod ? { delivery_method: shippingMethod } : {}) })
            })
            const packageData: any = await packageRes.json()
            if (packageData.code !== 0) throw new Error(`Zoho package ${pkg.packageNumber || pkg.zohoId}: ${packageData.message || 'shipment update failed'}`)
          }
          await prisma.package.update({ where: { id: pkg.id }, data: { status: 'shipped', trackingNumber, carrier: shippingMethod || pkg.carrier } })
        }
      }
      if (dbRecord) {
        const statusMap: Record<string, string> = { confirm: 'confirmed', shipped: 'shipped' }
        await prisma.salesOrder.update({
          where: { id: dbRecord.id },
          data: { status: statusMap[action] || action, appModifiedAt: new Date(), lastSyncedAt: new Date() }
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
        await assertNoBooksConflictBeforeWrite("quote", dbQuote)
      }

      const res = await fetch(`${baseUrl}/estimates/${booksId}/status/${action}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
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
          data: { status: action, appModifiedAt: new Date(), lastSyncedAt: new Date() }
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
