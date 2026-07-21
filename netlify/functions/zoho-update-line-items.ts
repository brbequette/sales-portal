import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken as getAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
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

  const { documentId, type = "Invoice", lineItems } = body
  if (!documentId || !lineItems || !Array.isArray(lineItems)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing documentId or lineItems" }) }
  }

  try {
    let booksDocId = documentId

    // Try finding in database to resolve Books ID
    let dbDoc: any = null
    if (type === "Invoice") {
      dbDoc = await prisma.invoice.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      if (dbDoc && (dbDoc.items as any)?.booksInvoiceId) booksDocId = (dbDoc.items as any).booksInvoiceId
    } else if (type === "SalesOrder") {
      dbDoc = await prisma.salesOrder.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      if (dbDoc && (dbDoc.items as any)?.booksSalesOrderId) booksDocId = (dbDoc.items as any).booksSalesOrderId
    } else if (type === "Quote") {
      dbDoc = await prisma.quote.findFirst({ where: { OR: [{ id: documentId }, { zohoId: documentId }] } })
      if (dbDoc && (dbDoc.items as any)?.booksEstimateId) booksDocId = (dbDoc.items as any).booksEstimateId
    }

    const token = await getAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    
    const endpoints: Record<string, string> = {
      Invoice: "invoices",
      SalesOrder: "salesorders",
      Quote: "estimates"
    }
    const endpoint = endpoints[type]
    if (!endpoint) throw new Error("Invalid document type")

    // 1. Fetch the document details from Zoho Books to get the current payload
    const zohoRes = await fetch(`${baseUrl}/${endpoint}/${booksDocId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })

    if (!zohoRes.ok) {
      const errorText = await zohoRes.text()
      throw new Error(`Zoho API failed to fetch ${type}: ${errorText}`)
    }

    const zohoData: any = await zohoRes.json()
    if (zohoData.code !== 0) {
      throw new Error(`Zoho error: ${zohoData.message}`)
    }

    const doc = zohoData[type === "Quote" ? "estimate" : type.toLowerCase()]
    if (!doc) {
      throw new Error('Document not found in Zoho Books.')
    }

    // 2. Merge line items
    // The UI sends an array of line items with rate, quantity, and name updated.
    // Also manual dead cost can be sent and saved in custom fields. 
    // We update the rate, quantity, and name, and preserve other required fields like item_id, tax_id, etc.
    const updatedLineItems = doc.line_items.map((existingItem: any) => {
      const updateData = lineItems.find((li: any) => li.line_item_id === existingItem.line_item_id)
      if (updateData) {
        return {
          ...existingItem,
          rate: updateData.rate !== undefined ? updateData.rate : existingItem.rate,
          quantity: updateData.quantity !== undefined ? updateData.quantity : existingItem.quantity,
          name: updateData.name !== undefined ? updateData.name : existingItem.name,
          description: updateData.description !== undefined ? updateData.description : existingItem.description
        }
      }
      return existingItem
    })

    // 3. Update the document in Zoho Books
    const payload = {
      customer_id: doc.customer_id,
      line_items: updatedLineItems,
      shipping_charge: doc.shipping_charge || 0,
      adjustment: doc.adjustment || 0,
      adjustment_description: doc.adjustment_description || ""
    }

    const updateRes = await fetch(`${baseUrl}/${endpoint}/${booksDocId}?organization_id=${ORG_ID}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const updateData: any = await updateRes.json()
    if (updateData.code !== 0) {
      throw new Error(`Zoho error updating ${type}: ${updateData.message}`)
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ 
        success: true, 
        message: `${type} updated successfully`,
        updatedDocument: updateData[type === "Quote" ? "estimate" : type.toLowerCase()]
      })
    }

  } catch (error: any) {
    console.error("Error updating Zoho line items:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: error.message || "Internal server error" })
    }
  }
}
