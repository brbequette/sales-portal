import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler, HandlerResponse } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"
import { completionId, parseTaskCompletion, saveTaskCompletion, type CompletionInput } from "../../src/lib/task-completion"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const authenticatedHandler: Handler = async (event, context): Promise<HandlerResponse> => {
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
      ? await prisma.task.findUnique({ where: { id: taskId }, include: { deal: { select: { accountId: true } } } })
      : await prisma.task.findUnique({ where: { zohoId }, include: { deal: { select: { accountId: true } } } })
    if (!existingTask) {
      return { statusCode: 404, body: JSON.stringify({ success: false, message: "Task not found" }) }
    }
    if (!administrator && (!actorId || existingTask.ownerId !== actorId)) {
      return { statusCode: 403, body: JSON.stringify({ success: false, message: "Forbidden: You do not own this task" }) }
    }
    if (existingTask.zohoId !== zohoId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Task identifiers do not match" }) }
    }
    let completion: CompletionInput | undefined
    let revenueInvoiceId: string | undefined
    if (body.completion !== undefined) {
      try { completion = parseTaskCompletion(body.completion, new Date(0)) } catch (error) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: error instanceof Error ? error.message : 'Invalid completion' }) }
      }
      if (status !== 'Completed') return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Completion must mark the task completed' }) }
      const receipt = await prisma.taskOutcome.findUnique({ where: { id: completionId(existingTask.id, completion.requestId) } })
      if (receipt) {
        if (receipt.summary !== completion.summary || receipt.outcomeType !== completion.outcomeType || (receipt.nextAction || '') !== (completion.nextAction || '') || (receipt.followUpAt?.toISOString() || '') !== (completion.followUpAt ? new Date(completion.followUpAt).toISOString() : '')) {
          return { statusCode: 409, body: JSON.stringify({ success: false, message: 'This completion request was already saved with different details. Refresh to review it.' }) }
        }
        return { statusCode: 200, body: JSON.stringify({ success: true, repeated: true, outcome: receipt }) }
      }
      if (completion.followUpAt && Date.parse(completion.followUpAt) <= Date.now()) return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Choose a future follow-up date and time' }) }
      if (existingTask.status === 'Completed') return { statusCode: 409, body: JSON.stringify({ success: false, message: 'Task already completed. Refresh to view its outcome.' }) }
      if (completion.invoiceNumber) {
        const accountId = existingTask.accountId || existingTask.deal?.accountId
        const invoices = accountId ? await prisma.invoice.findMany({ where: { accountId, OR: [
          { id: completion.invoiceNumber }, { zohoId: completion.invoiceNumber }, { invoiceNumber: completion.invoiceNumber }, { computedInvoiceNumber: completion.invoiceNumber },
        ] }, select: { id: true }, take: 2 }) : []
        if (invoices.length !== 1) return { statusCode: 400, body: JSON.stringify({ success: false, message: 'Enter an unambiguous invoice number belonging to this task’s account.' }) }
        revenueInvoiceId = invoices[0].id
      }
    }
    if (subject !== undefined && (typeof subject !== 'string' || !subject.trim())) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Enter a task title" }) }
    }
    if (status !== undefined && !['Not Started', 'In Progress', 'Deferred', 'Completed', 'Waiting on someone else'].includes(status)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid task status" }) }
    }
    if (priority !== undefined && !['High', 'Normal', 'Low'].includes(priority)) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid task priority" }) }
    }
    for (const value of [dueDate, reminderAt]) {
      if (value && (typeof value !== 'string' || !Number.isFinite(new Date(value).getTime()))) {
        return { statusCode: 400, body: JSON.stringify({ success: false, message: "Invalid task date" }) }
      }
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
    if (typeof whatId === 'string' && whatId.startsWith('invoice:')) return { statusCode: 409, body: JSON.stringify({ success: false, message: 'This deal is waiting for its verified CRM mapping.', code: 'CRM_DEAL_MAPPING_REQUIRED' }) }
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

    // CRM IDs are numeric. Titan-generated callbacks and operational tasks
    // have namespaced IDs and must never be sent to the CRM task endpoint.
    if (/^\d+$/.test(existingTask.zohoId)) {
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
      localUpdateData.dueDateIsDateOnly = dueDate ? /^\d+$/.test(existingTask.zohoId) || /^\d{4}-\d{2}-\d{2}$/.test(dueDate) : null
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

    if (completion) {
      const result = await saveTaskCompletion(prisma, existingTask, localUpdateData, completion, { id: actorId!, name: sessionUser.email }, revenueInvoiceId)
      return { statusCode: 200, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ success: true, ...result }) }
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
