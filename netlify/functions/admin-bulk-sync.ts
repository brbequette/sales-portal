import { Handler } from "@netlify/functions"
import { bulkSyncPage } from "./lib/bulk-sync"
import { prisma } from "./lib/prisma"
import { corsHeaders, handleOptions } from "./lib/cors"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  try {
    const body = JSON.parse(event.body || "{}")
    const entity = body.entity || "invoices"
    const page = parseInt(body.page || "1", 10)

    // Build nameMap once here — avoids a full Account table scan inside bulkSyncPage
    const allAccounts = await prisma.account.findMany({ select: { id: true, name: true } })
    const nameMap = new Map<string, string>()
    allAccounts.forEach(a => nameMap.set(a.name.toLowerCase().trim(), a.id))

    console.log(`Bulk sync handler: ${entity} page ${page} (nameMap: ${nameMap.size} accounts)`)
    const result = await bulkSyncPage(entity, page, nameMap)

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ success: !result.error, ...result })
    }
  } catch (err: any) {
    console.error("Admin bulk sync Netlify function error:", err)
    return {
      statusCode: 500,
      headers: corsHeaders,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

