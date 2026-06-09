import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { subject, description, priority, dueDate, ownerId, whatId, status = "Not Started" } = body

    if (!subject || !ownerId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing required fields (subject, ownerId)" }) }
    }

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
      Subject: subject,
      Status: status,
      Priority: priority || "Normal",
      Owner: { id: user.zohoId }
    }

    if (dueDate) {
      taskData.Due_Date = new Date(dueDate).toISOString().split('T')[0] // format YYYY-MM-DD
    }
    
    if (description) {
      taskData.Description = description
    }

    // What_Id refers to Account, Deal, etc.
    if (whatId) {
      // whatId is expected to be a valid Zoho ID for the related record
      // You can pass the module name as se_module (e.g., Accounts, Deals)
      taskData.What_Id = { id: whatId }
      // taskData.$se_module = "Accounts" // Usually Zoho infers it, but we'll let Zoho handle it
    }

    const payload = {
      data: [taskData]
    }

    const res = await fetch(`https://www.zohoapis.com/crm/v3/Tasks`, {
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
        subject,
        description,
        priority: priority || "Normal",
        status: status,
        dueDate: dueDate ? new Date(dueDate) : null,
        ownerId: user.id,
        accountId,
        dealId
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
