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
    const { accountId, type, amount, items, lineItems, discountTotal, userId, userEmail } = body

    if (!accountId || !type || amount === undefined) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing required fields" })
      }
    }

    // Resolve author for Salesperson mapping
    let author = null
    if (userId) {
      author = await prisma.user.findUnique({ where: { id: userId } })
    }
    if (!author && userEmail) {
      author = await prisma.user.findUnique({ where: { email: userEmail } })
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

    const token = await getZohoAccessToken()
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // First, resolve the true Zoho Books Contact ID
    let booksContactId = null;

    // Search for existing contact by zcrm_account_id (most reliable link)
    const searchRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}&zcrm_account_id=${account.zohoId}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    const searchData = await searchRes.json()
    
    if (searchData.contacts && searchData.contacts.length > 0) {
      booksContactId = searchData.contacts[0].contact_id
    } else {
      // Fallback: search by name
      const searchByNameRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}&contact_name=${encodeURIComponent(account.name)}`, {
        headers: { Authorization: `Zoho-oauthtoken ${token}` }
      })
      const searchByNameData = await searchByNameRes.json()
      
      if (searchByNameData.contacts && searchByNameData.contacts.length > 0) {
        booksContactId = searchByNameData.contacts[0].contact_id
      } else {
        // Create new contact in Zoho Books
        const createRes = await fetch(`${baseUrl}/contacts?organization_id=${ORG_ID}`, {
          method: "POST",
          headers: {
            Authorization: `Zoho-oauthtoken ${token}`,
            "Content-Type": "application/json"
          },
          body: JSON.stringify({
            contact_name: account.name,
            zcrm_account_id: account.zohoId // links to CRM if integration allows
          })
        })
        const createData = await createRes.json()
        if (createData.code !== 0) {
          throw new Error(`Zoho Books Error (Create Contact): ${createData.message}`)
        }
        booksContactId = createData.contact.contact_id
      }
    }

    // Prepare Zoho Books Payload
    const payload = {
      customer_id: booksContactId,
      salesperson_name: author?.name || "System Admin",
      line_items: (lineItems || []).map((li: any) => ({
        name: li.name,
        description: li.description,
        rate: li.rate,
        quantity: li.quantity,
        discount: li.discount || 0
      })),
      discount_type: "item_level",
      is_discount_before_tax: true,
      notes: "Created via Sales Portal POS"
    }

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
