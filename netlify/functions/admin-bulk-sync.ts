import { Handler } from "@netlify/functions"
import { bulkSyncPage } from "./lib/bulk-sync"

const headers = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Content-Type": "application/json"
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers, body: "" }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const entity = body.entity || "invoices"
    const page = parseInt(body.page || "1", 10)

    console.log(`Bulk sync handler: ${entity} page ${page}`)
    const result = await bulkSyncPage(entity, page)

    return {
      statusCode: 200,
      headers,
      body: JSON.stringify({ success: !result.error, ...result })
    }
  } catch (err: any) {
    console.error("Admin bulk sync Netlify function error:", err)
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
