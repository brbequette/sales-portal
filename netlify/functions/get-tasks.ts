import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"
const authenticatedHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const auth = await authenticateFunction(event)
    const {
      zohoId: requestedZohoId,
      email: requestedEmail,
      ownerIdFilter,
      checkOnly,
    } = event.queryStringParameters || {}
    const sessionDbUser = await prisma.user.findFirst({
      where: {
        OR: [
          auth.dbId ? { id: auth.dbId } : undefined,
          auth.userId ? { id: auth.userId } : undefined,
          auth.email ? { email: { equals: auth.email, mode: "insensitive" } } : undefined,
        ].filter(Boolean) as any,
      },
    })

    if (!sessionDbUser) {
      return { statusCode: 403, body: JSON.stringify({ success: false, message: "Signed-in user is not linked to a local user record" }) }
    }

    const sessionIsAdmin = isAdminRole(sessionDbUser.role)
    let user = sessionDbUser
    if (sessionIsAdmin && (requestedZohoId || (requestedEmail && requestedEmail.toLowerCase() !== sessionDbUser.email.toLowerCase()))) {
      const requestedUser = await prisma.user.findFirst({
        where: {
          OR: [
            requestedZohoId ? { id: requestedZohoId } : undefined,
            requestedZohoId ? { zohoId: requestedZohoId } : undefined,
            requestedEmail ? { email: { equals: requestedEmail, mode: "insensitive" } } : undefined,
          ].filter(Boolean) as any,
        },
      })
      if (requestedUser) user = requestedUser
    }

    const isAdmin = sessionIsAdmin && user.id === sessionDbUser.id
    const isSalesOnly = !isAdmin

    // ── checkOnly mode: returns count + latestUpdatedAt only ──────────────
    if (checkOnly === 'true') {
      const whereClause = isSalesOnly ? { ownerId: user.id } : {}
      const [count, latest] = await Promise.all([
        prisma.task.count({ where: whereClause }),
        prisma.task.findFirst({ where: whereClause, orderBy: { updatedAt: 'desc' }, select: { updatedAt: true } })
      ])
      return {
        statusCode: 200,
        headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' },
        body: JSON.stringify({ success: true, checkOnly: true, count, latestUpdatedAt: latest?.updatedAt ?? null })
      }
    }

    // Refresh re-queries PostgreSQL only; provider task import is a separate action.


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
    const tasks = await prisma.task.findMany({ take: 500, 
      where: whereClause,
      include: {
        account: true,
        deal: true
      },
      orderBy: { dueDate: 'asc' }
    })

    // ── Fetch owner names for all tasks ────────────────────────────────────
    const ownerIds = [...new Set(tasks.map(t => t.ownerId).filter(Boolean))]
    const owners = await prisma.user.findMany({ take: 500, 
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
        accountPhone: (t.account?.rawData as any)?.Phone || null,
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

export const handler = withFunctionAuth(authenticatedHandler)
