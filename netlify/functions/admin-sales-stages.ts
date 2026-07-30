import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  try {
    // GET: List all active stages
    if (event.httpMethod === "GET") {
      const stages = await prisma.salesStage.findMany({
        where: { isActive: true },
        orderBy: { order: "asc" }
      })
      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, stages })
      }
    }

    // POST: Create or Update a stage
    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { id, name, slug, order, color, description, autoActions, notifications, transitionRule, isActive } = body

      if (!name || !slug) {
        return {
          statusCode: 400,
          headers: corsHeaders,
          body: JSON.stringify({ success: false, error: "Missing name or slug" })
        }
      }

      if (id) {
        const stage = await prisma.salesStage.update({
          where: { id },
          data: {
            name,
            slug,
            order: parseInt(order, 10) || 0,
            color: color || "#6b7280",
            description,
            autoActions: autoActions || {},
            notifications: notifications || {},
            transitionRule: transitionRule || {},
            isActive: isActive !== undefined ? isActive : true
          }
        })
        return {
          statusCode: 200,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, stage })
        }
      } else {
        // Ensure slug is unique
        const existing = await prisma.salesStage.findUnique({ where: { slug } })
        if (existing) {
          return {
            statusCode: 400,
            headers: corsHeaders,
            body: JSON.stringify({ success: false, error: "Slug must be unique" })
          }
        }

        const stage = await prisma.salesStage.create({
          data: {
            name,
            slug,
            order: parseInt(order, 10) || 0,
            color: color || "#6b7280",
            description,
            autoActions: autoActions || {},
            notifications: notifications || {},
            transitionRule: transitionRule || {},
            isActive: true
          }
        })
        return {
          statusCode: 201,
          headers: corsHeaders,
          body: JSON.stringify({ success: true, stage })
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

      const stage = await prisma.salesStage.update({
        where: { id },
        data: { isActive: false }
      })

      return {
        statusCode: 200,
        headers: corsHeaders,
        body: JSON.stringify({ success: true, stage })
      }
    }

    return {
      statusCode: 405,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: "Method Not Allowed" })
    }
  } catch (err: any) {
    console.error("Admin Sales Stages Error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
