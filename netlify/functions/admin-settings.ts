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
      // SystemSetting is a key-value store: { key: string, value: string }
      const records = await prisma.systemSetting.findMany()
      const settings: Record<string, string> = {}
      records.forEach(r => { settings[r.key] = r.value })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, settings }) }
    }

    if (event.httpMethod === "PUT" || event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      // Upsert each key-value pair
      for (const [key, value] of Object.entries(body)) {
        if (value !== undefined) {
          await prisma.systemSetting.upsert({
            where: { key },
            update: { value: String(value) },
            create: { key, value: String(value) }
          })
        }
      }
      // Return updated settings
      const records = await prisma.systemSetting.findMany()
      const settings: Record<string, string> = {}
      records.forEach(r => { settings[r.key] = r.value })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, settings }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err: any) {
    console.error("Admin Settings Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
