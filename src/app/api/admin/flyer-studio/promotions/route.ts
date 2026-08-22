import { NextResponse } from "next/server"
import { requireAdministrator } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"
import { calculatePromotionFinancials, type PromotionCostInput } from "@/lib/promotion-financials"

const clean = (value: unknown, max = 200) => String(value || "").trim().slice(0, max)

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  return NextResponse.json({ success: true, promotions: await prisma.promotionDraft.findMany({ orderBy: { updatedAt: "desc" }, take: 50 }) })
}

export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  try {
    const body = await request.json()
    const id = clean(body.id, 80) || undefined
    const name = clean(body.name)
    const sku = clean(body.sku, 80).toUpperCase().replace(/[^A-Z0-9_-]/g, "-")
    if (!name || !sku) return NextResponse.json({ error: "Promotion name and SKU are required." }, { status: 400 })
    const costs = body.costs as PromotionCostInput
    const financials = calculatePromotionFinancials(costs)
    if (financials.grossProfit < 0) return NextResponse.json({ error: "This promotion loses money. Adjust pricing or costs before saving." }, { status: 400 })
    const bundleItems = Array.isArray(body.bundleItems) ? body.bundleItems.slice(0, 30) : []
    const description = JSON.stringify({
      text: clean(body.description, 2000), image: clean(body.flyerSmsImage, 2_000_000), promotionDraft: true,
      bundleItems, financials, sourceUrl: clean(body.sourceUrl, 2000), status: "active",
    })
    const localProduct = await prisma.product.upsert({
      where: { sku },
      create: { sku, name, description, price: financials.grossProfit + financials.totalCost, category: "Promotions", stock: 0, subjectToVig: true },
      update: { name, description, price: financials.grossProfit + financials.totalCost, category: "Promotions" },
    })
    const data = {
      name, sku, status: "READY", repId: clean(body.repId, 80) || null, campaignTemplateId: clean(body.campaignTemplateId, 80) || null,
      localProductId: localProduct.id, sourceUrl: clean(body.sourceUrl, 2000) || null, giveawayName: clean(body.giveawayName) || null,
      giveawayImageUrl: clean(body.giveawayImageUrl, 2_000_000) || null, referenceImages: Array.isArray(body.referenceImages) ? body.referenceImages.slice(0, 4) : [],
      bundleItems, marketingCopy: body.marketingCopy || {}, financials,
      flyerSmsImage: clean(body.flyerSmsImage, 2_000_000) || null, flyerEmailImage: clean(body.flyerEmailImage, 3_000_000) || null,
      createdBy: auth.session?.user?.dbId || auth.session?.user?.id || auth.session?.user?.email || null,
    }
    const promotion = id
      ? await prisma.promotionDraft.update({ where: { id }, data })
      : await prisma.promotionDraft.upsert({ where: { sku }, create: data, update: data })
    return NextResponse.json({ success: true, promotion, localProduct, financials })
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to save promotion"
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
