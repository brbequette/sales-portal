import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID;

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { accountId, type, amount, items, lineItems, discountTotal } = body

    if (!accountId || !type || amount === undefined) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing required fields" })
      }
    }

    // Let's resolve the actual db account and the zoho customer id
    const account = await prisma.account.findFirst({
      where: {
        OR: [
          { id: accountId },
          { zohoId: accountId }
        ]
      }
    })

    if (!account) {
      throw new Error("Account not found")
    }

    const dbAccountId = account.id
    const booksCustomerId = account.zohoId

    // Prepare Zoho Books Payload
    const payload = {
      customer_id: booksCustomerId,
      line_items: (lineItems || []).map((li: any) => ({
        name: li.name,
        description: li.description,
        rate: li.rate,
        quantity: li.quantity
      })),
      discount: discountTotal > 0 ? discountTotal : 0,
      discount_type: discountTotal > 0 ? "entity_level" : undefined,
      is_discount_before_tax: true,
      notes: "Created via Sales Portal POS"
    }

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`
    
    let booksRefId = null

    if (type === "Quote") {
      const res = await fetch(`${baseUrl}/estimates?organization_id=${ORG_ID}`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.code !== 0) throw new Error(`Zoho Books Error: ${data.message}`)
      booksRefId = data.estimate?.estimate_id
    } else if (type === "SalesOrder") {
      const res = await fetch(`${baseUrl}/salesorders?organization_id=${ORG_ID}`, {
        method: "POST",
        headers: {
          Authorization: `Zoho-oauthtoken ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload)
      })
      const data = await res.json()
      if (data.code !== 0) throw new Error(`Zoho Books Error: ${data.message}`)
      booksRefId = data.salesorder?.salesorder_id
    } else {
       return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid type" }) }
    }

    // Now save to Prisma database
    let transaction;
    if (type === "Quote") {
      transaction = await prisma.quote.create({
        data: {
          accountId: dbAccountId,
          amount,
          items: items || [],
          status: "Draft",
          validUntil: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) // 30 days
        }
      })
    } else if (type === "SalesOrder") {
      transaction = await prisma.salesOrder.create({
        data: {
          accountId: dbAccountId,
          amount,
          items: items || [],
          status: "Pending",
        }
      })
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ success: true, transaction, booksRefId })
    }

  } catch (error: any) {
    console.error('Create Transaction Error:', error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
