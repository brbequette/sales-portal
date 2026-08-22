import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"
import { FLYER_CAMPAIGN_TYPES, FLYER_CATALOGS } from "@/lib/flyer-studio-config"
import imageMapData from "@/lib/image-map.json"

const imageMap = imageMapData as Record<string, { image?: string | null }>

function productDetails(description: string | null) {
  if (!description) return { text: "" }
  try {
    const parsed = JSON.parse(description)
    return typeof parsed === "object" && parsed ? parsed : { text: description }
  } catch {
    return { text: description }
  }
}

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  const [products, campaigns, reps, references, promotionDrafts] = await Promise.all([
    prisma.product.findMany({ orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.campaignTemplate.findMany({ orderBy: { updatedAt: "desc" } }),
    prisma.user.findMany({
      select: { id: true, name: true, email: true, phone: true },
      orderBy: { name: "asc" },
    }),
    prisma.mediaAsset.findMany({
      where: { OR: [{ category: { contains: "flyer", mode: "insensitive" } }, { type: { contains: "image", mode: "insensitive" } }] },
      orderBy: { updatedAt: "desc" },
      take: 24,
    }),
    prisma.promotionDraft.findMany({ orderBy: { updatedAt: "desc" }, take: 30 }),
  ])

  const mappedProducts = products.map((product) => {
    const details = productDetails(product.description) as Record<string, unknown>
    const costCandidate = Number(details.cost ?? details.purchaseRate ?? details.purchase_rate ?? 0)
    return {
      ...product,
      description: typeof details.text === "string" ? details.text : product.description,
      imageUrl: imageMap[product.sku]?.image || (typeof details.image === "string" ? details.image : null),
      unitCost: Number.isFinite(costCandidate) ? costCandidate : 0,
      productStatus: typeof details.status === "string" ? details.status.toLowerCase() : "active",
      catalogIds: FLYER_CATALOGS.filter((catalog) => catalog.matches(product)).map((catalog) => catalog.id),
    }
  })

  return NextResponse.json({
    success: true,
    products: mappedProducts.filter((product) => product.productStatus !== "inactive"),
    gifts: mappedProducts.filter((product) => product.giftItem && product.productStatus !== "inactive"),
    catalogs: FLYER_CATALOGS.map(({ id, label, description }) => ({ id, label, description })),
    campaignTypes: FLYER_CAMPAIGN_TYPES,
    campaigns,
    reps: reps.map((rep) => ({ ...rep, name: rep.name || rep.email })),
    references,
    promotionDrafts,
  })
}
