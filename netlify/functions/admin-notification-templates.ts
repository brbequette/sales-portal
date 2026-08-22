import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  try {
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, corsHeaders)
  }

  try {
    // GET: List all active notification templates
    if (event.httpMethod === "GET") {
      const templates = await prisma.notificationTemplate.findMany({
        where: { isActive: true },
        orderBy: { createdAt: "desc" }
      })
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, templates })
      }
    }

    // POST: Create or Update a template
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { id, name, channel, subject, body: templateBody, isActive } = body

      if (!name || !channel || !templateBody) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: "Missing name, channel, or body" })
        }
      }

      if (id) {
        const template = await prisma.notificationTemplate.update({
          where: { id },
          data: {
            name,
            channel,
            subject: subject || null,
            body: templateBody,
            isActive: isActive !== undefined ? isActive : true
          }
        })
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, template })
        }
      } else {
        const template = await prisma.notificationTemplate.create({
          data: {
            name,
            channel,
            subject: subject || null,
            body: templateBody,
            isActive: true
          }
        })
        return {
          statusCode: 201,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, template })
        }
      }
    }

    // DELETE: Soft-delete (set isActive = false)
    if (event.httpMethod === "DELETE") {
      const id = event.queryStringParameters?.id
      if (!id) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: "Missing id query parameter" })
        }
      }

      const template = await prisma.notificationTemplate.update({
        where: { id },
        data: { isActive: false }
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, template })
      }
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    }
  } catch (err: any) {
    console.error("Admin Notification Templates Error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
