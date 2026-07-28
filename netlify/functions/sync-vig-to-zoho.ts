import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

import { prisma } from "./lib/prisma"
const ZOHO_DC = process.env.ZOHO_DC || "com"
const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"

// Cache customfield_ids per module to prevent redundant GET requests
const customFieldIdCache: Record<string, string> = {}

async function updateCustomFieldInZoho(module: string, docId: string, token: string, apiName: string, newValue: any) {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/${module}`
  
  const cacheKey = `${module}_${apiName}`
  let customfield_id = customFieldIdCache[cacheKey]

  if (!customfield_id) {
    // 1. Fetch document to get the correct customfield_id (Only once per module)
    const getRes = await fetch(`${baseUrl}/${docId}?organization_id=${ORG_ID}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    if (!getRes.ok) return false
    const data = await getRes.json()
    const docType = module === "invoices" ? "invoice" : module === "salesorders" ? "salesorder" : "estimate"
    const doc = data[docType]
    if (!doc || !doc.custom_fields) return false

    const field = doc.custom_fields.find((f: any) => f.api_name === apiName)
    if (!field) return false

    customfield_id = field.customfield_id
    customFieldIdCache[cacheKey] = customfield_id
  }

  // 2. PUT update directly since we have the customfield_id
  const putRes = await fetch(`${baseUrl}/${docId}?organization_id=${ORG_ID}`, {
    method: "PUT",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      custom_fields: [
        {
          customfield_id: customfield_id,
          value: newValue
        }
      ]
    })
  })

  return putRes.ok
}

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: "Method Not Allowed" }
  }

  try {
    const data = JSON.parse(event.body || "{}")
    const { repId, monthKey, newVigRate } = data

    if (!repId || !monthKey || newVigRate === undefined) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing required fields" }) }
    }

    const token = await getZohoAccessToken()

    const startOfMonth = new Date(`${monthKey}-01T00:00:00Z`)
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59, 999)

    // Find user by repId or fallback to name/email search
    let repUser = await prisma.user.findUnique({ where: { id: repId } })
    if (!repUser) {
      repUser = await prisma.user.findFirst({
        where: {
          OR: [
            { name: { equals: repId, mode: 'insensitive' } },
            { name: { contains: repId, mode: 'insensitive' } },
            { email: { startsWith: repId, mode: 'insensitive' } }
          ]
        }
      })
    }

    if (!repUser) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: `Sales rep "${repId}" not found in database` }) }
    }

    const targetRepId = repUser.id

    // Since our local Invoices map to Zoho Books invoices and contain the salesperson name
    const localInvoices = await prisma.invoice.findMany({
      where: {
        issueDate: { gte: startOfMonth, lte: endOfMonth }
      }
    })

    const repNameLower = repUser.name?.toLowerCase().trim() || repUser.email.split('@')[0].toLowerCase()

    let successCount = 0
    let failCount = 0
    let apiCallsCount = 0

    // Helper for throttling
    const delay = (ms: number) => new Promise(res => setTimeout(res, ms))

    // Filter to only those invoices belonging to this rep
    for (const inv of localInvoices) {
      const items = inv.items as any
      const salespersonName = items?.salesperson?.toLowerCase().trim()
      
      let matches = false
      if (salespersonName && (salespersonName === repNameLower || salespersonName.includes(repNameLower) || repNameLower.includes(salespersonName))) {
        matches = true
      }
      
      if (!matches) {
        // Check account owner as fallback
        if (inv.accountId) {
          const acc = await prisma.account.findUnique({ where: { id: inv.accountId } })
          if (acc?.ownerId === targetRepId) matches = true
        }
      }

      if (matches && inv.zohoId) {
        // Each invoice update requires 1-2 API calls (1 GET if uncached + 1 PUT)
        const ok = await updateCustomFieldInZoho("invoices", inv.zohoId as string, token as string, "cf_salesperson_vig", newVigRate)
        apiCallsCount += 2
        if (ok) successCount++
        else failCount++
        
        // Add a small delay to prevent tripping Zoho Books rate limits
        await delay(250)
      }
    }

    // Update MonthlyVigGoal tracking record in DB
    await prisma.monthlyVigGoal.upsert({
      where: { repId_monthKey: { repId: targetRepId, monthKey } },
      update: { lastSyncedVigRate: parseFloat(newVigRate), lastSyncedAt: new Date() },
      create: { repId: targetRepId, monthKey, manualVigRate: parseFloat(newVigRate), lastSyncedVigRate: parseFloat(newVigRate), lastSyncedAt: new Date() }
    }).catch(err => console.warn("MonthlyVigGoal upsert warning:", err.message))

    return { 
      statusCode: 200, 
      headers: cors, 
      body: JSON.stringify({ 
        success: true, 
        apiCallsCount,
        successCount,
        failCount,
        message: `Synced VIG Rate (${newVigRate}x) for ${repUser.name} (${monthKey}) across ${successCount} invoice(s)! Required ${apiCallsCount} Zoho API calls.` 
      }) 
    }

  } catch (err: any) {
    console.error("Sync Vig Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
