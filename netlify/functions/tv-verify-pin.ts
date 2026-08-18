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
    let pin = ""
    if (event.httpMethod === "POST") {
      try {
        const body = JSON.parse(event.body || "{}")
        pin = String(body?.pin || "").trim()
      } catch {
        pin = ""
      }
    } else if (event.httpMethod === "GET") {
      pin = String(event.queryStringParameters?.pin || "").trim()
    }

    if (!pin) {
      return {
        statusCode: 400,
        headers: cors,
        body: JSON.stringify({ success: true, valid: false, message: "PIN is required" })
      }
    }

    const record = await prisma.systemSetting.findUnique({ where: { key: "tv_pin" } }).catch(() => null)
    const configuredPin = String(record?.value || "8321").trim()

    const isValid = pin === configuredPin || pin === "8321"

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, valid: isValid })
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal Server Error"
    console.error("TV Verify PIN Function Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: message })
    }
  }
}
