import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

const authenticatedHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "PUT") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const sessionUser = await authenticateFunction(event)
    const actorId = sessionUser.dbId || sessionUser.userId
    const administrator = isAdminRole(sessionUser.role)
    const body = JSON.parse(event.body || "{}")
    const { taskId, zohoId, subject, description, priority, dueDate, ownerId, status, whatId, invoiceId, salesOrderId, quoteId, estimateId, type, reminderAt, reminderMethod, reminderFired } = body

    if (!zohoId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing zohoId parameter" }) }
    }

    const existingTask = taskId
      ? await prisma.task.findUnique({ where: { id: taskId }, select: { id: true, ownerId: true } })
      : await prisma.task.findUnique({ where: { zohoId }, select: { id: true, ownerId: true } })
    if (!existingTask) {
      return { statusCode: 404, body: JSON.stringify({ success: false, message: "Task not found" }) }
    }
    if (!administrator && (!actorId || existingTask.ownerId !== actorId)) {
      return { statusCode: 403, body: JSON.stringify({ success: false, message: "Forbidden: You do not own this task" }) }
    }

    if (!administrator && whatId) {
      const [linkedAccount, linkedDeal] = await Promise.all([
        prisma.account.findUnique({ where: { zohoId: whatId }, select: { ownerId: true } }),
        prisma.deal.findUnique({ where: { zohoId: whatId }, select: { ownerId: true } }),
      ])
      const linkedOwnerId = linkedAccount?.ownerId || linkedDeal?.ownerId
      if (linkedOwnerId && linkedOwnerId !== actorId) {
        return { statusCode: 403, body: JSON.stringify({ success: false, message: "Forbidden: Linked record belongs to another representative" }) }
      }
    }

    const taskData: any = { id: zohoId }
    let capSubject = subject
    if (subject) {
      capSubject = subject.charAt(0).toUpperCase() + subject.slice(1)
      taskData.Subject = capSubject
    }

    let capDesc = description ? description.charAt(0).toUpperCase() + description.slice(1) : (description || "")
    let finalDescription = capDesc
    const extraDescLines = []
    if (invoiceId) extraDescLines.push(`Linked Invoice: ${invoiceId}`)
    if (salesOrderId) extraDescLines.push(`Linked Sales Order: ${salesOrderId}`)
    if (quoteId) extraDescLines.push(`Linked Quote: ${quoteId}`)
    if (estimateId) extraDescLines.push(`Linked Estimate: ${estimateId}`)
    
    if (extraDescLines.length > 0) {
      finalDescription = (finalDescription + "\n\n" + extraDescLines.join("\n")).trim()
    }

    if (finalDescription) {
      taskData.Description = finalDescription
    } else if (description === "") {
      taskData.Description = null
    }

    if (priority) taskData.Priority = priority
    if (status) taskData.Status = status
    if (dueDate !== undefined) {
      taskData.Due_Date = dueDate ? new Date(dueDate).toISOString().split('T')[0] : null
    }

    let resolvedOwnerId = null
    if (ownerId) {
      let internalOwner = await prisma.user.findUnique({ where: { id: ownerId } })
      if (!internalOwner) {
        internalOwner = await prisma.user.findUnique({ where: { zohoId: ownerId } })
      }
      if (!internalOwner) {
        internalOwner = await prisma.user.findUnique({ where: { email: ownerId } })
      }
      if (internalOwner && internalOwner.zohoId) {
        if (!administrator && internalOwner.id !== actorId) {
          return { statusCode: 403, body: JSON.stringify({ success: false, message: "Only administrators can reassign tasks" }) }
        }
        taskData.Owner = { id: internalOwner.zohoId }
        resolvedOwnerId = internalOwner.id
      }
    }

    if (whatId !== undefined) {
      if (whatId) {
        taskData.What_Id = { id: whatId }
      } else {
        taskData.What_Id = null
      }
    }

    const token = await getZohoAccessToken()
    
    // Update in Zoho
    const payload = {
      data: [taskData]
    }

    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks`, { signal: AbortSignal.timeout(15000),
      method: "PUT",
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const zohoData = await res.json()
    const zohoSuccess = zohoData.data && zohoData.data[0]?.code === "SUCCESS"

    if (!res.ok || !zohoSuccess) {
      console.error("Zoho Task Update failed:", JSON.stringify(zohoData))
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Failed to update task in Zoho", error: zohoData }) }
    }

    // Update locally
    const localUpdateData: any = {}
    if (subject) localUpdateData.subject = capSubject
    if (description !== undefined) localUpdateData.description = capDesc || null
    if (priority) localUpdateData.priority = priority
    if (status) localUpdateData.status = status
    if (type) localUpdateData.type = type
    if (dueDate !== undefined) {
      localUpdateData.dueDate = dueDate ? new Date(dueDate) : null
    }
    if (resolvedOwnerId) {
      localUpdateData.ownerId = resolvedOwnerId
    }
    
    if (invoiceId !== undefined) localUpdateData.invoiceId = invoiceId || null
    if (salesOrderId !== undefined) localUpdateData.salesOrderId = salesOrderId || null
    if (quoteId !== undefined) localUpdateData.quoteId = quoteId || null
    if (estimateId !== undefined) localUpdateData.estimateId = estimateId || null
    if (reminderAt !== undefined) localUpdateData.reminderAt = reminderAt ? new Date(reminderAt) : null
    if (reminderMethod !== undefined) localUpdateData.reminderMethod = reminderMethod || null
    if (reminderFired !== undefined) localUpdateData.reminderFired = reminderFired

    if (whatId !== undefined) {
      if (whatId) {
        const acc = await prisma.account.findUnique({ where: { zohoId: whatId } })
        if (acc) {
          localUpdateData.accountId = acc.id
          localUpdateData.dealId = null
        } else {
          const deal = await prisma.deal.findUnique({ where: { zohoId: whatId } })
          if (deal) {
            localUpdateData.dealId = deal.id
            localUpdateData.accountId = null
          }
        }
      } else {
        localUpdateData.accountId = null
        localUpdateData.dealId = null
      }
    }

    if (taskId) {
      await prisma.task.update({
        where: { id: taskId },
        data: localUpdateData
      })
    } else {
      await prisma.task.update({
        where: { zohoId: zohoId },
        data: localUpdateData
      })
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, message: "Task updated successfully" })
    }

  } catch (error: any) {
    console.error("Update Task Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
