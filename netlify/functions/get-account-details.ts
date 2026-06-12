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
            where: { status: { notIn: ['Writeoff', 'Write_off', 'Write Off', 'Bad Debt', 'Void', 'Draft'] } },
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
              where: { status: { notIn: ['Writeoff', 'Write_off', 'Write Off', 'Bad Debt', 'Void', 'Draft'] } },
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
      console.warn("Database connection failed, falling back to mock data:", dbError)
    }

    let crmDetails: any = null

    if (!account) {
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

    if (!account) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, message: "Account not found" })
      }
    }

    if (account && !crmDetails && account.zohoId) {
      try {
        const accessToken = await getZohoAccessToken()
        if (accessToken) {
          const ZOHO_DC = process.env.ZOHO_DC || 'com'
          const crmRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Accounts/${account.zohoId}`, {
            headers: {
              'Authorization': `Zoho-oauthtoken ${accessToken}`
            }
          })
          if (crmRes.ok) {
            const crmData = await crmRes.json()
            crmDetails = crmData.data?.[0] || null
          }
        }
      } catch (err) {
        console.error("Error fetching CRM details:", err)
      }
    }

    if (account) {
      account.crmDetails = crmDetails
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
