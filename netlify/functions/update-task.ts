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
    const { taskId, zohoId, status } = body

    if (!zohoId || !status) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing zohoId or status parameter" }) }
    }

    const token = await getZohoAccessToken()
    
    // Update in Zoho
    const payload = {
      data: [
        {
          id: zohoId,
          Status: status
        }
      ]
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
    if (taskId) {
      await prisma.task.update({
        where: { id: taskId },
        data: { status }
      })
    } else {
      await prisma.task.update({
        where: { zohoId: zohoId },
        data: { status }
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
