import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken , ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"
const ORG_ID = ZOHO_ORGANIZATION_ID
import { getSystemSettings } from "../../../../netlify/functions/lib/settings"

/**
 * sync-vig-to-zoho — Inline Next.js route (no Netlify proxy)
 *
 * Reads rep invoices from local DB for a given month and pushes the
 * VIG rate to Zoho Books custom field cf_salesperson_vig.
 *
 * POST body: { repId, monthKey, newVigRate }
 */

const ZOHO_DC = process.env.ZOHO_DC || "com"

// Cache customfield_ids per module to avoid redundant GET requests
const customFieldIdCache: Record<string, string> = {}

async function updateCustomFieldInZoho(
  module: string,
  docId: string,
  token: string,
  apiName: string,
  newValue: any
): Promise<boolean> {
  const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3/${module}`
  const cacheKey = `${module}_${apiName}`
  let customfield_id = customFieldIdCache[cacheKey]

  if (!customfield_id) {
    const getRes = await fetch(`${baseUrl}/${docId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Zoho-oauthtoken ${token}` },
    })
    if (!getRes.ok) return false
    const data = await getRes.json()
    const docType = module === "invoices" ? "invoice" : module === "salesorders" ? "salesorder" : "estimate"
    const doc = data[docType]
    if (!doc?.custom_fields) return false
    const field = doc.custom_fields.find((f: any) => f.api_name === apiName)
    if (!field) return false
    customfield_id = field.customfield_id
    customFieldIdCache[cacheKey] = customfield_id
  }

  const putRes = await fetch(`${baseUrl}/${docId}?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
    method: "PUT",
    headers: {
      Authorization: `Zoho-oauthtoken ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      custom_fields: [{ customfield_id, value: newValue }],
    }),
  })
  return putRes.ok
}

export async function POST(req: NextRequest) {
  try {
    const appSettings = await getSystemSettings(prisma)
    if (appSettings.pause_mass_zoho_updates) {
      return NextResponse.json(
        { success: false, error: "Mass Zoho updates are PAUSED in System Settings." },
        { status: 403 }
      )
    }

    const body = await req.json()
    const { repId, monthKey, newVigRate } = body

    if (!repId || !monthKey || newVigRate === undefined) {
      return NextResponse.json({ error: "Missing required fields: repId, monthKey, newVigRate" }, { status: 400 })
    }

    const token = await getZohoAccessToken()
    if (!token) throw new Error("Failed to get Zoho access token")

    const startOfMonth = new Date(`${monthKey}-01T00:00:00Z`)
    const endOfMonth = new Date(startOfMonth.getFullYear(), startOfMonth.getMonth() + 1, 0, 23, 59, 59, 999)

    // Resolve user
    let repUser = await prisma.user.findUnique({ where: { id: repId } })
    if (!repUser) {
      repUser = await prisma.user.findFirst({
        where: {
          OR: [
            { name: { equals: repId, mode: "insensitive" } },
            { name: { contains: repId, mode: "insensitive" } },
            { email: { startsWith: repId, mode: "insensitive" } },
          ],
        },
      })
    }
    if (!repUser) {
      return NextResponse.json({ success: false, error: `Rep "${repId}" not found` }, { status: 404 })
    }

    const targetRepId = repUser.id
    const repNameLower = repUser.name?.toLowerCase().trim() || repUser.email.split("@")[0].toLowerCase()

    const localInvoices = await prisma.invoice.findMany({
      where: { issueDate: { gte: startOfMonth, lte: endOfMonth } },
    })

    const normalizeRepName = (n: string) => {
      return (n || "").toLowerCase().replace(/\s+/g, " ").trim()
    }

    let successCount = 0
    let failCount = 0
    let apiCallsCount = 0
    const delay = (ms: number) => new Promise((res) => setTimeout(res, ms))

    for (const inv of localInvoices) {
      const items = inv.items as any
      const salesperson = items?.salesperson || ""
      const normSalesperson = normalizeRepName(salesperson)
      const normRepName = normalizeRepName(repNameLower)

      let matches =
        normSalesperson &&
        (normSalesperson === normRepName ||
          normSalesperson.includes(normRepName) ||
          normRepName.includes(normSalesperson))

      if (!matches && inv.accountId) {
        const acc = await prisma.account.findUnique({ where: { id: inv.accountId } })
        if (acc?.ownerId === targetRepId) matches = true
      }

      if (matches && inv.zohoId) {
        const ok = await updateCustomFieldInZoho(
          "invoices",
          inv.zohoId as string,
          token as string,
          "cf_salesperson_vig",
          newVigRate
        )
        apiCallsCount += 2
        if (ok) successCount++
        else failCount++
        await delay(250)
      }
    }

    // Track in DB
    await prisma.monthlyVigGoal
      .upsert({
        where: { repId_monthKey: { repId: targetRepId, monthKey } },
        update: { lastSyncedVigRate: parseFloat(newVigRate), lastSyncedAt: new Date() },
        create: {
          repId: targetRepId,
          monthKey,
          manualVigRate: parseFloat(newVigRate),
          lastSyncedVigRate: parseFloat(newVigRate),
          lastSyncedAt: new Date(),
        },
      })
      .catch((err: any) => console.warn("MonthlyVigGoal upsert warning:", err.message))

    return NextResponse.json({
      success: true,
      apiCallsCount,
      successCount,
      failCount,
      message: `Synced VIG Rate (${newVigRate}x) for ${repUser.name} (${monthKey}) across ${successCount} invoice(s).`,
    })
  } catch (err: any) {
    console.error("sync-vig-to-zoho error:", err)
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse("", {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
    },
  })
}
