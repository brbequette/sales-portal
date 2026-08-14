import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"
import { prisma } from "./lib/prisma"

const ZOHO_DC = process.env.ZOHO_DC || 'com';

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "DELETE") {
    return { statusCode: 405, body: JSON.stringify({ success: false, message: "Method Not Allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { taskId, zohoId } = body

    if (!zohoId && !taskId) {
      return { statusCode: 400, body: JSON.stringify({ success: false, message: "Missing taskId or zohoId" }) }
    }

    // Resolve the task
    let task: any = null
    if (taskId) {
      task = await prisma.task.findUnique({ where: { id: taskId } })
    }
    if (!task && zohoId) {
      task = await prisma.task.findUnique({ where: { zohoId } })
    }

    if (!task) {
      return { statusCode: 404, body: JSON.stringify({ success: false, message: "Task not found" }) }
    }

    // Delete from Zoho CRM
    const token = await getZohoAccessToken()
    const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/crm/v3/Tasks?ids=${task.zohoId}`, { signal: AbortSignal.timeout(15000),
      method: "DELETE",
      headers: {
        'Authorization': `Zoho-oauthtoken ${token}`,
      }
    })

    const zohoData = await res.json()
    const zohoSuccess = zohoData.data && zohoData.data[0]?.code === "SUCCESS"

    if (!res.ok || !zohoSuccess) {
      console.error("Zoho Task Delete failed:", JSON.stringify(zohoData))
      // Still delete locally even if Zoho fails
    }

    // Delete locally
    await prisma.task.delete({ where: { id: task.id } })

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ success: true, message: "Task deleted successfully" })
    }

  } catch (error: any) {
    console.error("Delete Task Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
