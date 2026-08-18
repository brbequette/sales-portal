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

  const documentId = body.documentId || body.zohoId
  const { type = "Invoice", lineItems } = body
  if (!documentId || !lineItems || !Array.isArray(lineItems)) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing documentId (or zohoId) or lineItems" }) }
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
    const zohoRes = await fetch(`${baseUrl}/${endpoint}/${booksDocId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
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
    const sanitizeLineItem = (item: any) => {
      const allowedKeys = [
        "line_item_id",
        "item_id",
        "name",
        "description",
        "rate",
        "quantity",
        "discount",
        "discount_amount",
        "tax_id",
        "tax_name",
        "tax_percentage",
        "tax_type",
        "header_id",
        "line_item_category"
      ]
      const cleanItem: any = {}
      for (const key of allowedKeys) {
        if (item[key] !== undefined) {
          cleanItem[key] = item[key]
        }
      }
      return cleanItem
    }

    const updatedLineItems = doc.line_items.map((existingItem: any) => {
      const updateData = lineItems.find((li: any) => li.line_item_id === existingItem.line_item_id)
      const merged = updateData
        ? {
            ...existingItem,
            rate: updateData.rate !== undefined ? updateData.rate : existingItem.rate,
            quantity: updateData.quantity !== undefined ? updateData.quantity : existingItem.quantity,
            name: updateData.name !== undefined ? updateData.name : existingItem.name,
            description: updateData.description !== undefined ? updateData.description : existingItem.description
          }
        : existingItem
      return sanitizeLineItem(merged)
    })

    // Find and append new line items that don't exist in doc.line_items
    const newItems = lineItems.filter((li: any) => {
      if (!li.line_item_id || String(li.line_item_id).startsWith("new_")) {
        return true
      }
      return !doc.line_items.some((existingItem: any) => existingItem.line_item_id === li.line_item_id)
    })

    const formattedNewItems = newItems.map((li: any) => {
      const isNumericId = li.item_id && /^\d+$/.test(String(li.item_id))
      return sanitizeLineItem({
        item_id: isNumericId ? String(li.item_id) : undefined,
        name: li.name,
        description: li.description || "",
        rate: parseFloat(li.rate || 0),
        quantity: parseInt(li.quantity || 0),
      })
    })

    const combinedLineItems = [...updatedLineItems, ...formattedNewItems]

    // 3. Update the document in Zoho Books
    const payload = {
      customer_id: doc.customer_id,
      line_items: combinedLineItems,
      shipping_charge: doc.shipping_charge || 0,
      adjustment: doc.adjustment || 0,
      adjustment_description: doc.adjustment_description || ""
    }

    const updateRes = await fetch(`${baseUrl}/${endpoint}/${booksDocId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
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
