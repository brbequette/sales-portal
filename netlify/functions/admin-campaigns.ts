import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

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
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  try {
    if (event.httpMethod === "GET") {
      const templates = await prisma.campaignTemplate.findMany({
        orderBy: { createdAt: 'desc' }
      })
      const blasts = await prisma.campaignBlast.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          author: { select: { name: true } },
          logs: {
            take: 50,
            include: {
              account: { select: { name: true } }
            }
          }
        }
      })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, templates, blasts }) }
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { name, content, imageUrl, channel } = body

      const template = await prisma.campaignTemplate.create({
        data: { name, content, imageUrl, channel }
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, template }) }
    }

    if (event.httpMethod === "DELETE") {
      const params = event.queryStringParameters || {}
      const id = params.id
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing ID" }) }

      await prisma.campaignTemplate.delete({ where: { id } })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err: any) {
    console.error("Admin Campaigns Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
