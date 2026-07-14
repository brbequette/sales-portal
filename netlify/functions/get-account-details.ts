import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { id } = event.queryStringParameters || {}

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing id parameter" })
      }
    }

    let account: any = null;

    try {
      // Try finding by zohoId first, then by internal id
      account = await prisma.account.findUnique({
        where: { zohoId: id },
        include: {
          invoices: { 
            orderBy: { issueDate: 'desc' } 
          },
          salesOrders: { orderBy: { orderDate: 'desc' } },
          quotes: { orderBy: { createdAt: 'desc' } },
          deals: { orderBy: { closingDate: 'desc' } },
          notes: { orderBy: { createdAt: 'desc' } },
          tasks: { orderBy: { dueDate: 'asc' } },
          contacts: true
        }
      })

      if (!account) {
        account = await prisma.account.findUnique({
          where: { id: id },
          include: {
            invoices: { 
              orderBy: { issueDate: 'desc' } 
            },
            salesOrders: { orderBy: { orderDate: 'desc' } },
            quotes: { orderBy: { createdAt: 'desc' } },
            deals: { orderBy: { closingDate: 'desc' } },
            notes: { orderBy: { createdAt: 'desc' } },
            tasks: { orderBy: { dueDate: 'asc' } },
            contacts: true
          }
        })
      }
    } catch (dbError) {
      console.warn("Database connection failed:", dbError)
    }

    if (!account) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, message: "Account not found" })
      }
    }

    // Fetch enrichment from Zoho Books contact (address, contact persons) if not cached
    let booksContact: any = null
    if (account && account.zohoId) {
      try {
        const accessToken = await getZohoAccessToken()
        if (accessToken) {
          const ZOHO_DC = process.env.ZOHO_DC || 'com'
          const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || '664670946'
          const booksRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/contacts/${account.zohoId}?organization_id=${ORG_ID}`, {
            headers: { 'Authorization': `Zoho-oauthtoken ${accessToken}` }
          })
          if (booksRes.ok) {
            const booksData = await booksRes.json()
            booksContact = booksData.contact || null

            // Cache address in DB if missing
            if (booksContact?.billing_address && !account.billingStreet) {
              const ba = booksContact.billing_address
              const sa = booksContact.shipping_address
              await prisma.account.update({
                where: { id: account.id },
                data: {
                  billingStreet: ba.address || null,
                  billingCity: ba.city || null,
                  billingState: ba.state || null,
                  billingZip: ba.zip || null,
                  shippingStreet: sa?.address || null,
                  shippingCity: sa?.city || null,
                  shippingState: sa?.state || null,
                  shippingZip: sa?.zip || null,
                }
              })
              account.billingStreet = ba.address || null
              account.billingCity = ba.city || null
              account.billingState = ba.state || null
              account.billingZip = ba.zip || null
              account.billingCountry = ba.country || null
              account.shippingStreet = sa?.address || null
              account.shippingCity = sa?.city || null
              account.shippingState = sa?.state || null
              account.shippingZip = sa?.zip || null
              account.shippingCountry = sa?.country || null
            }
          }
        }
      } catch (err) {
        console.error("Error fetching Books contact:", err)
      }
    }

    if (account) {
      account.booksContact = booksContact
    }

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({ success: true, account })
    }

  } catch (error: any) {
    console.error("Get Account Details Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
