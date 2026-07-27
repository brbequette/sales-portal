import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    if (event.httpMethod === "GET") {
      const scripts = await prisma.callScript.findMany({
        orderBy: { createdAt: 'desc' }
      })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, scripts }) }
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { name, callType, content, isActive } = body

      if (!name || !callType || !content) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: 'Missing required fields' }) }
      }

      const script = await prisma.callScript.create({
        data: {
          name,
          callType,
          content,
          isActive: isActive !== undefined ? isActive : true
        }
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, script }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err: any) {
    console.error("Admin Scripts Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
