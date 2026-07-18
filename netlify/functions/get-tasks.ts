import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()
const ZOHO_DC = process.env.ZOHO_DC || 'com';

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
      if (zohoId.startsWith('c') && zohoId.length >= 20) {
        user = await prisma.user.findUnique({ where: { id: zohoId } })
      } else {
        user = await prisma.user.findUnique({ where: { zohoId: zohoId } })
      }
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
    }

    // Auto-heal Ben and Monty's roles/names in the database
    const lowerEmail = user.email?.toLowerCase() || "";
    let needsUpdate = false;
    let updateData: any = {};

    if ((
      lowerEmail.includes("ben") || 
      lowerEmail.includes("monty") || 
      lowerEmail.includes("bequette") || 
      lowerEmail.includes("morgan")
    ) && user.role !== "Administrator") {
      updateData.role = "Administrator";
      needsUpdate = true;
    }

    if (lowerEmail === "ben@titandiamond.net" && user.name !== "Benjamin Bequette") {
      updateData.name = "Benjamin Bequette";
      needsUpdate = true;
    }

    if (needsUpdate) {
      console.log(`Auto-healing role/name for ${user.email}...`);
      user = await prisma.user.update({
        where: { id: user.id },
        data: updateData
      });
    }

    const normalizedRole = user.role?.toLowerCase() || "";
    const isSalesOnly = normalizedRole.includes("sales") && 
                        !normalizedRole.includes("admin") && 
                        !normalizedRole.includes("administrator") && 
                        !normalizedRole.includes("manager") && 
                        !normalizedRole.includes("collections");

    if (refresh === "true") {
      // Sync tasks from Zoho CRM
      try {
        const token = await getZohoAccessToken()
        
        let url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks?fields=Subject,Status,Priority,Due_Date,Owner,What_Id,Description`
        if (isSalesOnly && user.zohoId) {
          // If Sales-only, we only want to fetch tasks for this user
          url = `https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks/search?criteria=(Owner:equals:${user.zohoId})&fields=Subject,Status,Priority,Due_Date,Owner,What_Id,Description`
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

            const subjLower = (task.Subject || "").toLowerCase()
            let inferredType = "Task"
            if (subjLower.includes("call")) inferredType = "Call"
            else if (subjLower.includes("email")) inferredType = "Email"
            else if (subjLower.includes("text") || subjLower.includes("sms")) inferredType = "Text"
            else if (subjLower.includes("processing") || subjLower.includes("process")) inferredType = "Processing"

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
                  dealId: dealId,
                  type: inferredType
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

          // Delete tasks that no longer exist in Zoho
          const syncedTaskZohoIds = new Set(zohoTasks.map((t: any) => t.id));
          const ownerWhere = isSalesOnly ? { ownerId: user.id } : {};
          const localTasks = await prisma.task.findMany({
            where: ownerWhere,
            select: { id: true, zohoId: true }
          });
          const orphanedTaskIds = localTasks
            .filter(t => t.zohoId && !syncedTaskZohoIds.has(t.zohoId))
            .map(t => t.id);
          if (orphanedTaskIds.length > 0) {
            await prisma.task.deleteMany({ where: { id: { in: orphanedTaskIds } } });
            console.log(`Deleted ${orphanedTaskIds.length} tasks removed from Zoho CRM.`);
          }
        }
      } catch (syncErr) {
        console.error("Task sync error:", syncErr)
      }
    }

    // Calculate where filter based on role and ownerIdFilter parameter
    let whereClause: any = {}
    if (isSalesOnly) {
      whereClause = { ownerId: user.id }
    } else {
      if (ownerIdFilter && ownerIdFilter !== "all" && ownerIdFilter !== "All") {
        whereClause = { ownerId: ownerIdFilter }
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

    // ── Fetch owner names for all tasks ────────────────────────────────────
    const ownerIds = [...new Set(tasks.map(t => t.ownerId).filter(Boolean))]
    const owners = await prisma.user.findMany({
      where: { id: { in: ownerIds } },
      select: { id: true, name: true }
    })
    const ownerNameMap = new Map(owners.map(u => [u.id, u.name]))

    // Priority normalizer (DB stores High/Normal/Low but legacy may store uppercase)
    const normPriority = (p: string | null) => {
      const s = (p || 'Normal').toLowerCase()
      if (s === 'high') return 'High'
      if (s === 'low') return 'Low'
      return 'Normal'
    }

    const formattedTasks = tasks.map(t => {
      // Use real stored type — fall back to subject inference if blank
      let taskType = t.type || 'Task'
      const subjLower = (t.subject || '').toLowerCase()
      if (!t.type || t.type === 'Task') {
        if (subjLower.includes('call')) taskType = 'Call'
        else if (subjLower.includes('email')) taskType = 'Email'
        else if (subjLower.includes('text') || subjLower.includes('sms')) taskType = 'Text'
        else if (subjLower.includes('processing') || subjLower.includes('process')) taskType = 'Processing'
      }

      return {
        id: t.id,
        zohoId: t.zohoId,
        title: t.subject || 'Untitled Task',
        description: t.description,
        status: t.status || 'Not Started',
        priority: normPriority(t.priority),
        type: taskType,
        dueDate: t.dueDate,
        ownerId: t.ownerId,
        ownerName: ownerNameMap.get(t.ownerId) || null,
        accountId: t.account?.zohoId || null,
        accountDbId: t.accountId,
        accountName: t.account?.name || null,
        accountPhone: t.account?.phone || null,
        dealId: t.deal?.zohoId || null,
        dealDbId: t.dealId,
        dealName: t.deal?.name || null,
        invoiceId: t.invoiceId || null,
        salesOrderId: t.salesOrderId || null,
        quoteId: t.quoteId || null,
        estimateId: t.estimateId || null,
        reminderAt: t.reminderAt,
        reminderMethod: t.reminderMethod,
        reminderFired: t.reminderFired,
        actionUrl: t.account?.zohoId ? `/account/${t.account.zohoId}` : '#'
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
