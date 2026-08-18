import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event) => {
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
      const setting = await prisma.systemSetting.findUnique({
        where: { key: "zoho_phone_numbers" }
      })
      const numbers = setting ? JSON.parse(setting.value) : []
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, numbers }) }
    } 
    else if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { numbers } = body
      if (!Array.isArray(numbers)) throw new Error("numbers must be an array")
      
      await prisma.systemSetting.upsert({
        where: { key: "zoho_phone_numbers" },
        update: { value: JSON.stringify(numbers) },
        create: { key: "zoho_phone_numbers", value: JSON.stringify(numbers) }
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, message: "Method not allowed" }) }
  } catch (error: any) {
    console.error("Zoho Numbers Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler, { requireAdmin: true })
