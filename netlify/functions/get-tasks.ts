import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const { zohoId, email, refresh } = event.queryStringParameters || {}

    if (!zohoId && !email) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing zohoId or email parameter" }) }
    }

    let user = null

    if (zohoId) {
      user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
    }
    if (!user && email) {
      user = await prisma.user.findUnique({ where: { email: email } })
    }

    if (!user) {
      // Auto-create user so fresh databases don't 404 (mirrors get-accounts behavior)
      if (email || zohoId) {
        user = await prisma.user.create({
          data: {
            email: email || `${zohoId}@titandiamond.net`,
            zohoId: zohoId || `auto-${Date.now()}`,
            name: email ? email.split('@')[0] : 'User',
            role: 'Sales Representative'
          }
        })
      } else {
        return { statusCode: 404, body: JSON.stringify({ success: false, message: "User not found" }) }
      }
    }

    const isAdmin = user.role?.toLowerCase().includes("admin") || user.role === "Administrator"

    if (refresh === "true") {
      // Sync tasks from Zoho CRM
      try {
        const token = await getZohoAccessToken()
        
        let url = `https://www.zohoapis.com/crm/v3/Tasks?fields=Subject,Status,Priority,Due_Date,Owner,What_Id,Description`
        if (!isAdmin && user.zohoId) {
          // If not admin, maybe we only want to fetch tasks for this user?
          // The CRM API has a search endpoint, but for simplicity we can fetch recently updated or just fetch all active tasks if the volume isn't huge, or use search.
          url = `https://www.zohoapis.com/crm/v3/Tasks/search?criteria=(Owner:equals:${user.zohoId})&fields=Subject,Status,Priority,Due_Date,Owner,What_Id,Description`
        }

        const res = await fetch(url, {
          headers: { 'Authorization': `Zoho-oauthtoken ${token}` }
        })

        if (res.ok) {
          const data = await res.json()
          const zohoTasks = data.data || []

          for (const task of zohoTasks) {
            const ownerId = task.Owner?.id || user.zohoId
            
            // Try to resolve accountId or dealId from What_Id
            let accountId = null
            let dealId = null
            
            if (task.What_Id) {
               // Zoho's What_Id could be an Account, Deal, Quote, etc.
               // We will attempt to link it by ID if it exists in our DB.
               const acc = await prisma.account.findUnique({ where: { zohoId: task.What_Id.id } })
               if (acc) accountId = acc.id
               else {
                 const deal = await prisma.deal.findUnique({ where: { zohoId: task.What_Id.id } })
                 if (deal) dealId = deal.id
               }
            }
            
            // We need an internal user reference for owner
            let internalOwner = await prisma.user.findUnique({ where: { zohoId: ownerId } })
            if (!internalOwner) {
              internalOwner = user // Fallback
            }

            await prisma.task.upsert({
              where: { zohoId: task.id },
              create: {
                zohoId: task.id,
                subject: task.Subject || "Untitled Task",
                status: task.Status || "Not Started",
                priority: task.Priority || "Normal",
                dueDate: task.Due_Date ? new Date(task.Due_Date) : null,
                description: task.Description || null,
                ownerId: internalOwner.id,
                accountId: accountId,
                dealId: dealId
              },
              update: {
                subject: task.Subject || "Untitled Task",
                status: task.Status || "Not Started",
                priority: task.Priority || "Normal",
                dueDate: task.Due_Date ? new Date(task.Due_Date) : null,
                description: task.Description || null,
                ownerId: internalOwner.id,
                accountId: accountId,
                dealId: dealId
              }
            })
          }
        }
      } catch (syncErr) {
        console.error("Task sync error:", syncErr)
      }
    }

    // Return tasks from DB
    const tasks = await prisma.task.findMany({
      where: isAdmin ? {} : { ownerId: user.id },
      include: {
        account: true,
        deal: true
      },
      orderBy: { dueDate: 'asc' }
    })

    // Map them to the shape the frontend expects initially to not break everything immediately
    // The frontend currently expects: id, type, priority, title, description, actionUrl, accountId, ownerId
    const formattedTasks = tasks.map(t => {
      let actionUrl = "#"
      let type = "ACCOUNT_UPDATE"
      if (t.dealId) {
        type = "DEAL_FOLLOWUP"
        actionUrl = `/account/${t.deal?.zohoId || t.account?.zohoId || t.accountId}`
      } else if (t.accountId) {
        actionUrl = `/account/${t.account?.zohoId}`
      }

      return {
        id: t.id,
        zohoId: t.zohoId,
        type, // Legacy type mapping
        priority: t.priority?.toUpperCase() || 'MEDIUM',
        title: t.subject,
        description: t.description,
        actionUrl,
        accountId: t.account?.zohoId || t.deal?.zohoId,
        ownerId: t.ownerId,
        status: t.status,
        dueDate: t.dueDate
      }
    })

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, tasks: formattedTasks })
    }

  } catch (error: any) {
    console.error("Get Tasks Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
