import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "PUT") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { taskId, zohoId, subject, description, priority, dueDate, ownerId, status, whatId } = body

    if (!zohoId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing zohoId parameter" }) }
    }

    const taskData: any = { id: zohoId }
    if (subject) taskData.Subject = subject
    if (description !== undefined) taskData.Description = description || null
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

    const res = await fetch(`https://www.zohoapis.com/crm/v3/Tasks`, {
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
    if (subject) localUpdateData.subject = subject
    if (description !== undefined) localUpdateData.description = description || null
    if (priority) localUpdateData.priority = priority
    if (status) localUpdateData.status = status
    if (dueDate !== undefined) {
      localUpdateData.dueDate = dueDate ? new Date(dueDate) : null
    }
    if (resolvedOwnerId) {
      localUpdateData.ownerId = resolvedOwnerId
    }

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
