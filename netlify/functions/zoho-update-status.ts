import { Handler } from "@netlify/functions"
import { getZohoAccessToken as getAccessToken , ZOHO_ORGANIZATION_ID } from "./lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"
import { assertNoBooksConflictBeforeWrite } from "../../src/lib/sync-engine"
import { authorizeDocumentAccess } from "./lib/document-access"
import { Prisma } from "@prisma/client"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

async function adoptVerifiedConversionBaseline(
  salesOrder: any,
  token: string,
  baseUrl: string,
) {
  if (salesOrder.lastSyncedAt || salesOrder.appModifiedAt || !salesOrder.zohoId) return salesOrder

  const response = await fetch(`${baseUrl}/salesorders/${salesOrder.zohoId}?organization_id=${ORG_ID}`, {
    signal: AbortSignal.timeout(15000),
    headers: { Authorization: `Zoho-oauthtoken ${token}` },
  })
  const payload: any = await response.json().catch(() => null)
  if (!response.ok || payload?.code !== 0 || !payload?.salesorder) return salesOrder

  const remote = payload.salesorder
  const sourceEstimateId = String(remote.estimate_id || '').trim()
  if (!sourceEstimateId) return salesOrder

  const sourceQuote = await prisma.quote.findUnique({ where: { zohoId: sourceEstimateId }, select: { id: true } })
  if (!sourceQuote) return salesOrder

  const operationKey = `books:document:convert:Quote:${sourceQuote.id}:SalesOrder`
  const operation = await prisma.providerWriteOperation.findUnique({ where: { operationKey } })
  const providerIds = operation?.providerRecordIds as { newDocumentId?: string } | null
  if (operation?.state !== 'SUCCEEDED' || String(providerIds?.newDocumentId || '') !== String(salesOrder.zohoId)) {
    return salesOrder
  }

  const syncedAt = new Date()
  const providerModifiedAt = remote.last_modified_time ? new Date(remote.last_modified_time) : syncedAt
  return prisma.salesOrder.update({
    where: { id: salesOrder.id },
    data: {
      amount: Number(remote.total ?? salesOrder.amount),
      status: String(remote.status || salesOrder.status),
      orderDate: remote.date ? new Date(remote.date) : salesOrder.orderDate,
      items: remote,
      rawData: remote,
      zohoModifiedTime: providerModifiedAt,
      lastZohoModifiedTime: providerModifiedAt,
      lastSyncedAt: syncedAt,
      appModifiedAt: syncedAt,
      syncConflict: false,
      conflictFields: Prisma.DbNull,
      pendingZohoFetch: false,
    },
  })
}

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
      let dbSalesOrder = await prisma.salesOrder.findFirst({
        where: {
          OR: [
            { id: documentId },
            { zohoId: documentId }
          ]
        }
      })
      if (dbSalesOrder) {
        const reconciledSalesOrder = await adoptVerifiedConversionBaseline(dbSalesOrder, token, baseUrl)
        dbSalesOrder = reconciledSalesOrder
        dbRecord = reconciledSalesOrder
        const items = reconciledSalesOrder.items as any
        if (items?.booksSalesOrderId) {
          booksId = items.booksSalesOrderId
        }
        await assertNoBooksConflictBeforeWrite("salesorder", reconciledSalesOrder)
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

      const statusUrl = (status: string) => `${baseUrl}/estimates/${booksId}/status/${status}?organization_id=${ORG_ID}`
      const postStatus = async (status: string) => {
        const response = await fetch(statusUrl(status), {
          signal: AbortSignal.timeout(15000),
          method: 'POST',
          headers: {
            'Authorization': `Zoho-oauthtoken ${token}`,
            'Content-Type': 'application/json'
          }
        })
        const data: any = await response.json().catch(() => null)
        if (!response.ok || data?.code !== 0) {
          const code = data?.code != null ? ` [${data.code}]` : ''
          throw new Error(`Zoho error: ${data?.message || `Failed to ${status} quote`}${code}`)
        }
      }

      // Zoho only accepts a quote after it has reached Sent. Marking it sent
      // changes lifecycle state only; it does not invoke the email endpoint.
      if (action === 'accepted') {
        const currentResponse = await fetch(`${baseUrl}/estimates/${booksId}?organization_id=${ORG_ID}`, {
          signal: AbortSignal.timeout(15000),
          headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
        })
        const currentData: any = await currentResponse.json().catch(() => null)
        if (!currentResponse.ok || currentData?.code !== 0) {
          const code = currentData?.code != null ? ` [${currentData.code}]` : ''
          throw new Error(`Zoho error: ${currentData?.message || 'Failed to verify quote status'}${code}`)
        }
        const currentStatus = String(currentData?.estimate?.status || '').toLowerCase()
        if (currentStatus === 'draft') {
          await postStatus('sent')
          if (dbRecord) {
            await prisma.quote.update({
              where: { id: dbRecord.id },
              data: { status: 'sent', appModifiedAt: new Date(), lastSyncedAt: new Date() }
            })
          }
        } else if (currentStatus !== 'sent' && currentStatus !== 'accepted') {
          throw new Error(`Zoho error: Quote cannot be accepted from status '${currentStatus || 'unknown'}'`)
        }
        if (currentStatus !== 'accepted') await postStatus('accepted')
      } else {
        await postStatus(action)
      }

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
