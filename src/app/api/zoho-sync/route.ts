import { NextRequest, NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

/**
 * zoho-sync — Inline Next.js route (no Netlify proxy)
 *
 * Handles SYNC_ACCOUNTS action: upserts account data from a Zoho CRM
 * payload into the local database. Called by the Zoho CRM widget when
 * accounts are fetched/updated.
 *
 * POST body: { action: 'SYNC_ACCOUNTS', payload: { data: [...accounts] } }
 */

export async function POST(req: NextRequest) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { action, payload } = body

    if (action === "SYNC_ACCOUNTS") {
      const accounts = payload?.data || []
      let syncedCount = 0

      // Prefetch unique owner zohoIds to minimize DB round-trips
      const ownerIds = Array.from(
        new Set(accounts.map((r: any) => r.Owner?.id).filter(Boolean))
      ) as string[]

      const existingOwners = await prisma.user.findMany({
        where: { zohoId: { in: ownerIds } },
      })
      const ownerMap = new Map(existingOwners.map((u) => [u.zohoId, u]))

      // Upsert any owners not yet in the DB
      const missingOwners: Array<{ ownerId: string; ownerName: string }> = []
      for (const record of accounts) {
        if (!record.Owner?.id) continue
        const ownerId = record.Owner.id
        if (!ownerMap.has(ownerId)) {
          missingOwners.push({ ownerId, ownerName: record.Owner.name })
          ownerMap.set(ownerId, {} as any) // placeholder to prevent duplicates
        }
      }

      if (missingOwners.length > 0) {
        const upsertOps = missingOwners.map((u) =>
          prisma.user.upsert({
            where: { zohoId: u.ownerId },
            update: { name: u.ownerName },
            create: {
              zohoId: u.ownerId,
              name: u.ownerName,
              email: `${u.ownerId}@dummy.titandiamond.com`,
            },
          })
        )
        const upserted = await prisma.$transaction(upsertOps)
        upserted.forEach((u) => ownerMap.set(u.zohoId!, u))
      }

      // Build account upsert ops
      const accountOps = []
      for (const record of accounts) {
        if (!record.Owner?.id) continue
        const owner = ownerMap.get(record.Owner.id)
        if (!owner || !(owner as any).id) continue

        const lastPurchaseDate = record.Last_Purchase_Date
          ? new Date(record.Last_Purchase_Date)
          : null

        let status = "Open"
        if (lastPurchaseDate) {
          const twelveMonthsAgo = new Date()
          twelveMonthsAgo.setMonth(twelveMonthsAgo.getMonth() - 12)
          status = lastPurchaseDate < twelveMonthsAgo ? "Update Status" : "Personal"
        }

        const timeZone =
          record.Time_Zone ||
          record.Timezone ||
          record.timeZone ||
          record.timezone ||
          null

        accountOps.push(
          prisma.account.upsert({
            where: { zohoId: record.id },
            update: {
              name: record.Account_Name,
              industry: record.Industry,
              status,
              lastPurchaseAt: lastPurchaseDate,
              ownerId: (owner as any).id,
              timeZone,
            },
            create: {
              zohoId: record.id,
              name: record.Account_Name,
              industry: record.Industry,
              status,
              lastPurchaseAt: lastPurchaseDate,
              ownerId: (owner as any).id,
              timeZone,
            },
          })
        )
      }

      // Execute in batches of 50
      for (let i = 0; i < accountOps.length; i += 50) {
        const chunk = accountOps.slice(i, i + 50)
        await prisma.$transaction(chunk)
        syncedCount += chunk.length
      }

      return NextResponse.json({ success: true, message: `Synced ${syncedCount} accounts.` })
    }

    return NextResponse.json({ success: false, message: "Unknown action" }, { status: 400 })
  } catch (error: any) {
    console.error("zoho-sync error:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function OPTIONS() {
  return new NextResponse("", {
    status: 204,
    headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Methods": "POST, OPTIONS" },
  })
}
