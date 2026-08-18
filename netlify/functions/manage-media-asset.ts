import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { isAdmin } from "./lib/helpers"

import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event, context) => {
  // Support POST, PUT, DELETE
  const method = event.httpMethod;

  const corsHeaders: Record<string, string> = {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, PUT, DELETE, OPTIONS"
  };

  if (method === "OPTIONS") {
    return {
      statusCode: 200,
      headers: corsHeaders,
      body: ""
    }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { id, title, type, category, url, size, userId } = body

    // 1. Authorize Admin role via server-side lookup
    if (!userId) {
      return {
        statusCode: 400,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
        body: JSON.stringify({ success: false, message: "Missing userId" })
      }
    }

    const user = await prisma.user.findUnique({ where: { id: userId } })
    if (!user || !isAdmin(user.role)) {
      return {
        statusCode: 403,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
        body: JSON.stringify({ success: false, message: "Unauthorized. Admin role required." })
      }
    }

    if (method === "POST") {
      if (!title || !type || !category || !url) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
          body: JSON.stringify({ success: false, message: "Missing required fields: title, type, category, url" })
        }
      }

      const newAsset = await prisma.mediaAsset.create({
        data: {
          title,
          type,
          category,
          url,
          size: size || "1.0 MB"
        }
      })

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
        body: JSON.stringify({ success: true, asset: newAsset })
      }
    }

    if (method === "PUT") {
      if (!id) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
          body: JSON.stringify({ success: false, message: "Missing id for updates" })
        }
      }

      const updatedAsset = await prisma.mediaAsset.update({
        where: { id },
        data: {
          title,
          type,
          category,
          url,
          size
        }
      })

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
        body: JSON.stringify({ success: true, asset: updatedAsset })
      }
    }

    if (method === "DELETE") {
      if (!id) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
          body: JSON.stringify({ success: false, message: "Missing id for deletion" })
        }
      }

      await prisma.mediaAsset.delete({
        where: { id }
      })

      return {
        statusCode: 200,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
        body: JSON.stringify({ success: true, message: "Asset deleted successfully" })
      }
    }

    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }

  } catch (error: any) {
    console.error("Manage Media Asset Error:", error)
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" } as Record<string, string>,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
