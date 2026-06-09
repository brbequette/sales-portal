import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const { zohoId, email, refresh, ownerIdFilter, role: passedRole } = event.queryStringParameters || {}

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
            role: passedRole || 'Sales Representative'
          }
        })
      } else {
        return { statusCode: 404, body: JSON.stringify({ success: false, message: "User not found" }) }
      }
    } else if (passedRole && user.role.toLowerCase() !== passedRole.toLowerCase()) {
      console.log(`Updating database user role for ${user.email} from ${user.role} to ${passedRole}`)
      user = await prisma.user.update({
        where: { id: user.id },
        data: { role: passedRole }
      })
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

          // Prefetch matching Accounts, Deals, and Users to avoid N+1 DB calls
          const whatIds = Array.from(new Set(zohoTasks.map((t: any) => t.What_Id?.id).filter(Boolean))) as string[]
          const ownerIds = Array.from(new Set(zohoTasks.map((t: any) => t.Owner?.id || user.zohoId).filter(Boolean))) as string[]

          const [dbAccounts, dbDeals, dbUsers] = await Promise.all([
            prisma.account.findMany({
              where: { zohoId: { in: whatIds } },
              select: { id: true, zohoId: true }
            }),
            prisma.deal.findMany({
              where: { zohoId: { in: whatIds } },
              select: { id: true, zohoId: true }
            }),
            prisma.user.findMany({
              where: { zohoId: { in: ownerIds } }
            })
          ])

          const accountMap = new Map(dbAccounts.map(a => [a.zohoId, a.id]))
          const dealMap = new Map(dbDeals.map(d => [d.zohoId, d.id]))
          const userMap = new Map(dbUsers.map(u => [u.zohoId, u]))

          const taskOps = []
          for (const task of zohoTasks) {
            const ownerId = task.Owner?.id || user.zohoId
            
            // Try to resolve accountId or dealId from What_Id using pre-fetched maps
            let accountId = null
            let dealId = null
            
            if (task.What_Id) {
              const targetId = task.What_Id.id
              if (accountMap.has(targetId)) {
                accountId = accountMap.get(targetId) || null
              } else if (dealMap.has(targetId)) {
                dealId = dealMap.get(targetId) || null
              }
            }
            
            // Resolve internal owner user reference
            const internalOwner = userMap.get(ownerId) || user

            taskOps.push(
              prisma.task.upsert({
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
            )
          }

          // Execute in transaction batches of 50 to minimize connection pool usage
          for (let i = 0; i < taskOps.length; i += 50) {
            const chunk = taskOps.slice(i, i + 50)
            await prisma.$transaction(chunk)
          }
        }
      } catch (syncErr) {
        console.error("Task sync error:", syncErr)
      }
    }

    // Calculate where filter based on admin role and ownerIdFilter parameter
    let whereClause: any = { ownerId: user.id }
    if (isAdmin) {
      if (ownerIdFilter === "all") {
        whereClause = {}
      } else if (ownerIdFilter) {
        whereClause = { ownerId: ownerIdFilter }
      } else {
        whereClause = { ownerId: user.id } // Default to admin's own tasks
      }
    }

    // Return tasks from DB
    const tasks = await prisma.task.findMany({
      where: whereClause,
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
