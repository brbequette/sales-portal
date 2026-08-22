import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_DC, ZOHO_ORGANIZATION_ID } from "@/lib/zoho-auth"

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const { promotionId, confirm } = await request.json()
    if (confirm !== true) return NextResponse.json({ error: "Explicit confirmation is required before publishing to Zoho Books." }, { status: 400 })
    const promotion = await prisma.promotionDraft.findUnique({ where: { id: String(promotionId || "") } })
    if (!promotion) return NextResponse.json({ error: "Promotion draft not found." }, { status: 404 })
    if (promotion.zohoItemId) return NextResponse.json({ success: true, promotion, alreadyPublished: true })
    const financials = promotion.financials as Record<string, number>
    const token = await getZohoAccessToken()
    const response = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ZOHO_ORGANIZATION_ID}`, {
      method: "POST", headers: { Authorization: `Zoho-oauthtoken ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ name: promotion.name, sku: promotion.sku, rate: Number(financials.totalCost || 0) + Number(financials.grossProfit || 0), description: `Titan Diamond promotion bundle. Components: ${JSON.stringify(promotion.bundleItems)}`, product_type: "goods" }),
      signal: AbortSignal.timeout(20000),
    })
    const result = await response.json()
    if (!response.ok || !result.item?.item_id) throw new Error(result.message || `Zoho Books returned HTTP ${response.status}`)
    const updated = await prisma.promotionDraft.update({ where: { id: promotion.id }, data: { zohoItemId: result.item.item_id, status: "PUBLISHED", publishedAt: new Date() } })
    return NextResponse.json({ success: true, promotion: updated, zohoItem: result.item })
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Zoho publish failed" }, { status: 502 })
  }
}
