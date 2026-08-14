import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { 
      subject, description, priority, dueDate, ownerId, whatId, status = "Not Started",
      invoiceId, salesOrderId, quoteId, estimateId, type = "Task",
      reminderAt, reminderMethod
    } = body

    if (!subject || !ownerId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required fields (subject, ownerId)" }) }
    }

    // Capitalize inputs
    const capSubject = subject.charAt(0).toUpperCase() + subject.slice(1)
    const capDesc = description ? description.charAt(0).toUpperCase() + description.slice(1) : ""

    const token = await getZohoAccessToken()
    
    // Resolve user to get zohoId
    let user = await prisma.user.findUnique({ where: { id: ownerId } })
    if (!user) {
      user = await prisma.user.findUnique({ where: { zohoId: ownerId } })
    }
    if (!user) {
      user = await prisma.user.findUnique({ where: { email: ownerId } })
    }
    
    if (!user || !user.zohoId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Owner has no valid Zoho ID" }) }
    }

    // Prepare payload for Zoho
    const taskData: any = {
      Subject: capSubject,
      Status: status,
      Priority: priority || "Normal",
      Owner: { id: user.zohoId }
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
      taskData.What_Id = { id: whatId }
      taskData.$se_module = "Accounts"
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
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Failed to create task in Zoho", error: zohoData }) }
    }

    const newZohoId = recordDetails.details.id

    // Try to resolve What_Id locally for Prisma relations
    let accountId = null
    let dealId = null
    if (whatId) {
       const acc = await prisma.account.findUnique({ where: { zohoId: whatId } })
       if (acc) accountId = acc.id
       else {
         const deal = await prisma.deal.findUnique({ where: { zohoId: whatId } })
         if (deal) dealId = deal.id
       }
    }

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
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
