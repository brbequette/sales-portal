import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"

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

    // 1. Try finding by zohoId
    try {
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
    } catch (err: any) {
      console.warn("zohoId lookup failed:", err)
    }

    // 2. Fallback: find by internal DB id (CUID)
    if (!account) {
      try {
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
      } catch (err: any) {
        console.warn("Internal id lookup failed (non-CUID id?):", err)
      }
    }

    let crmDetails: any = null

    if (!account) {
      // Only attempt Zoho CRM self-heal if the id looks like a real Zoho CRM ID (all digits, 15-20 chars).
      // Internal DB CUIDs start with 'c' and are never valid Zoho IDs.
      const looksLikeZohoId = /^\d{15,20}$/.test(id)
      if (!looksLikeZohoId) {
        console.warn(`ID "${id}" does not look like a Zoho CRM ID, skipping self-heal.`)
      } else {
        // Attempt to fetch dynamically from Zoho CRM on the fly to self-heal missing records
        try {
          const accessToken = await getZohoAccessToken()
          if (accessToken) {
            const ZOHO_DC = process.env.ZOHO_DC || 'com'
            const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${id}`, {
              headers: {
                'Authorization': `Zoho-oauthtoken ${accessToken}`
              }
            })
            
            if (crmRes.ok) {
              const crmData = await crmRes.json()
              const record = crmData.data?.[0]
              
              if (record) {
                console.log(`Account ${id} found in Zoho CRM. Dynamic creation...`)
                
                // Find or create default owner
                const ownerZohoId = record.Owner?.id
                const ownerName = record.Owner?.name
                let ownerDbId = null
                
                if (ownerZohoId) {
                  let dbOwner = await prisma.user.findUnique({ where: { zohoId: ownerZohoId } })
                  if (!dbOwner) {
                    dbOwner = await prisma.user.create({
                      data: {
                        zohoId: ownerZohoId,
                        name: ownerName || "Unknown Owner",
                        email: `${ownerZohoId}@dummy.titandiamond.com`,
                        role: "Sales Representative"
                      }
                    })
                  }
                  ownerDbId = dbOwner.id
                }

                // Fallback owner if not found
                if (!ownerDbId) {
                  const firstUser = await prisma.user.findFirst()
                  ownerDbId = firstUser?.id || ""
                }

                let status = 'Open'
                const lastPurchaseDate = record.Last_Purchase_Date ? new Date(record.Last_Purchase_Date) : null
                if (lastPurchaseDate) {
                  const twelveMonthsAgo = new Date()
                  twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
                  status = lastPurchaseDate < twelveMonthsAgo ? 'Update Status' : 'Personal'
                }

                const tagsStr = Array.isArray(record.Tag)
                  ? record.Tag.map((t: any) => t.name).filter(Boolean).join(', ')
                  : null;

                account = await prisma.account.create({
                  data: {
                    zohoId: record.id,
                    name: record.Account_Name || record.name || 'Unnamed Account',
                    industry: record.Industry || 'Unknown',
                    tags: tagsStr,
                    status: status,
                    lastPurchaseAt: lastPurchaseDate,
                    ownerId: ownerDbId,
                    billingStreet: record.Billing_Street || null,
                    billingCity: record.Billing_City || null,
                    billingState: record.Billing_State || null,
                    billingZip: record.Billing_Code || null,
                  },
                  include: {
                    invoices: { orderBy: { issueDate: 'desc' } },
                    salesOrders: { orderBy: { orderDate: 'desc' } },
                    quotes: { orderBy: { createdAt: 'desc' } },
                    deals: { orderBy: { closingDate: 'desc' } },
                    notes: { orderBy: { createdAt: 'desc' } },
                    tasks: { orderBy: { dueDate: 'asc' } },
                    contacts: true
                  }
                })
                
                crmDetails = record
              }
            }
          }
        } catch (err) {
          console.error("Error auto-fetching missing account from Zoho CRM:", err)
        }
      }
    }

    if (!account) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, message: "Account not found" })
      }
    }

    // Enforce visibility restriction if caller parameters are supplied
    const { callerEmail, callerRole, callerDbId } = event.queryStringParameters || {}
    if (callerEmail) {
      const callerRoleLower = (callerRole || "").toLowerCase()
      const isAdmin = callerRoleLower.includes("admin") || callerRoleLower.includes("administrator")
      
      if (!isAdmin && account.ownerId !== callerDbId) {
        return {
          statusCode: 403,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ success: false, message: "Forbidden: You do not own this account." })
        }
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
