import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
import { isAdminRole } from "../../src/lib/roles"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const authenticatedHandler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const sessionUser = await authenticateFunction(event)
    const actorId = sessionUser.dbId || sessionUser.userId
    const administrator = isAdminRole(sessionUser.role)
    const body = JSON.parse(event.body || "{}")
    const { 
      subject, description, priority, dueDate, ownerId, whatId, status = "Not Started",
      invoiceId, salesOrderId, quoteId, estimateId, type = "Task",
      reminderAt, reminderMethod
    } = body

    if (!subject) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required field: subject" }) }
    }

    const requestedOwnerId = ownerId || actorId
    if (!requestedOwnerId) {
      return { statusCode: 403, body: JSON.stringify({ success: false, message: "Signed-in user is not linked to a local user record" }) }
    }

    // Capitalize inputs
    const capSubject = subject.charAt(0).toUpperCase() + subject.slice(1)
    const capDesc = description ? description.charAt(0).toUpperCase() + description.slice(1) : ""

    const token = await getZohoAccessToken()
    
    // Resolve user to get zohoId
    let user = await prisma.user.findUnique({ where: { id: requestedOwnerId } })
    if (!user) {
      user = await prisma.user.findUnique({ where: { zohoId: requestedOwnerId } })
    }
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: requestedOwnerId } })
    }
    
    if (!user) return { statusCode: 400, body: JSON.stringify({ success: false, message: "Task owner was not found locally" }) }
    if (!administrator && user.id !== actorId) {
      return { statusCode: 403, body: JSON.stringify({ success: false, message: "Only administrators can assign tasks to another user" }) }
    }

    let linkedAccount: { id: string; ownerId: string; crmAccountId: string | null } | null = null
    let linkedDeal: { id: string; ownerId: string; zohoId: string } | null = null
    if (whatId) {
      linkedAccount = await prisma.account.findFirst({
        where: { OR: [{ id: whatId }, { crmAccountId: whatId }, { zohoId: whatId }] },
        select: { id: true, ownerId: true, crmAccountId: true },
      })
      if (!linkedAccount) {
        linkedDeal = await prisma.deal.findFirst({ where: { OR: [{ id: whatId }, { zohoId: whatId }] }, select: { id: true, ownerId: true, zohoId: true } })
      }
      if (!linkedAccount && !linkedDeal) return { statusCode: 404, body: JSON.stringify({ success: false, message: 'Linked account or deal was not found.' }) }
      if (linkedDeal && !/^\d{15,20}$/.test(linkedDeal.zohoId)) return { statusCode: 409, body: JSON.stringify({ success: false, message: 'This deal is waiting for its verified CRM mapping.', code: 'CRM_DEAL_MAPPING_REQUIRED' }) }
      if (linkedAccount && !linkedAccount.crmAccountId) {
        return { statusCode: 409, body: JSON.stringify({ success: false, message: 'This account must be reconciled to an authoritative CRM Account before a CRM task can be created.', code: 'CRM_ACCOUNT_MAPPING_REQUIRED' }) }
      }
    }

    if (!administrator && whatId) {
      const linkedOwnerId = linkedAccount?.ownerId || linkedDeal?.ownerId
      if (linkedOwnerId && linkedOwnerId !== actorId) {
        return { statusCode: 403, body: JSON.stringify({ success: false, message: "Linked record belongs to another representative" }) }
      }
    }

    // Prepare payload for Zoho
    const taskData: any = {
      Subject: capSubject,
      Status: status,
      Priority: priority || "Normal"
    }

    if (dueDate) {
      taskData.Due_Date = new Date(dueDate).toISOString().split('T')[0] // format YYYY-MM-DD
    }
    
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
    }

    // What_Id refers to Account, Deal, etc.
    if (whatId) {
      taskData.What_Id = { id: linkedAccount?.crmAccountId || linkedDeal?.zohoId }
      taskData.$se_module = linkedAccount ? "Accounts" : "Deals"
    }

    const payload = {
      data: [taskData]
    }

    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks`, { signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    })

    const zohoData = await res.json()
    const recordDetails = zohoData.data && zohoData.data[0]

    if (!res.ok || recordDetails?.code !== "SUCCESS") {
      console.error("Zoho Task Create failed:", JSON.stringify(zohoData))
      const providerCode = String(recordDetails?.code || zohoData?.code || `HTTP_${res.status}`)
      const rejectedField = String(recordDetails?.details?.api_name || recordDetails?.details?.field || '').trim()
      const baseProviderMessage = String(recordDetails?.message || zohoData?.message || 'Zoho CRM rejected task creation.')
      const providerMessage = rejectedField ? `${baseProviderMessage} (field: ${rejectedField})` : baseProviderMessage
      return { statusCode: 400, body: JSON.stringify({ success: false, message: `Failed to create task in Zoho: ${providerCode}: ${providerMessage}`, code: providerCode, providerMessage, providerError: zohoData }) }
    }

    const newZohoId = recordDetails.details.id

    // Try to resolve What_Id locally for Prisma relations
    let accountId = null
    let dealId = null
    if (linkedAccount) accountId = linkedAccount.id
    if (linkedDeal) dealId = linkedDeal.id

    // Create locally
    const newTask = await prisma.task.create({
      data: {
        zohoId: newZohoId,
        subject: capSubject,
        description: finalDescription,
        status: status,
        priority: priority || "Normal",
        dueDate: dueDate ? new Date(dueDate) : null,
        ownerId: user.id,
        accountId: accountId,
        dealId: dealId,
        invoiceId: invoiceId || null,
        salesOrderId: salesOrderId || null,
        quoteId: quoteId || null,
        estimateId: estimateId || null,
        type: type,
        reminderAt: reminderAt ? new Date(reminderAt) : null,
        reminderMethod: reminderMethod || null,
      }
    })

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, task: newTask, message: "Task created successfully" })
    }

  } catch (error: any) {
    console.error("Create Task Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, message: error.message, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
