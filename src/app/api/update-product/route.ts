import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "../../../../netlify/functions/lib/zoho-auth"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const data = await req.json()
    const { id, name, price, descriptionText, size, application, manufacturer, vendor, qualityTier, subjectToVig, giftItem, showOnWeb, giftReleaseRule, giftTags, giftSizes, giftBundleRequiresShirt, giftBundleComponents } = data

    if (!id) {
      return NextResponse.json({ error: "Missing product ID" }, { status: 400 })
    }

    // 1. Fetch current product to check for Zoho Item ID in description
    const existing = await prisma.product.findUnique({ where: { id } })
    if (!existing) {
      return NextResponse.json({ error: "Product not found" }, { status: 404 })
    }

    let parsedDesc: any = {}
    try {
      parsedDesc = JSON.parse(existing.description || "{}")
    } catch {
      parsedDesc = { text: existing.description || "" }
    }

    const itemId = parsedDesc.itemId
    const existingAttributes = existing.attributes && typeof existing.attributes === 'object' && !Array.isArray(existing.attributes) ? existing.attributes as Record<string, unknown> : {}
    const normalizedGiftReleaseRule = giftReleaseRule === 'IMMEDIATE' ? 'IMMEDIATE' : 'PAID_IN_FULL'
    const normalizeList = (value: unknown) => String(value || '').split(',').map(item => item.trim()).filter(Boolean).slice(0, 30)
    const normalizedComponents = Array.isArray(giftBundleComponents) ? giftBundleComponents.slice(0, 30).map((component: any) => ({
      mode: component?.mode === 'VARIABLE_TAG' ? 'VARIABLE_TAG' : 'FIXED',
      productId: String(component?.productId || '').trim(),
      optionTag: String(component?.optionTag || '').trim().toLowerCase(),
      quantity: Math.max(1, Math.min(99, Number(component?.quantity) || 1)),
    })) : []
    if (normalizedComponents.some(component => component.mode === 'FIXED' ? !component.productId : !component.optionTag)) return NextResponse.json({ error: 'Every bundle component needs an exact product or variable option tag.' }, { status: 400 })
    const bundleProducts = normalizedComponents.length ? await prisma.product.findMany({ where: { OR: [{ id: { in: normalizedComponents.filter(component => component.mode === 'FIXED').map(component => component.productId) } }, { giftItem: true }] } }) : []
    const fixedProducts = new Map(bundleProducts.map(product => [product.id, product]))
    const resolveTags = (product: any) => product.attributes && typeof product.attributes === 'object' && Array.isArray((product.attributes as any).giftTags) ? (product.attributes as any).giftTags.map((tag: unknown) => String(tag).toLowerCase()) : []
    for (const component of normalizedComponents) {
      const candidates = component.mode === 'FIXED' ? [fixedProducts.get(component.productId)].filter(Boolean) : bundleProducts.filter(product => resolveTags(product).includes(component.optionTag))
      if (!candidates.length) return NextResponse.json({ error: `Bundle component ${component.mode === 'FIXED' ? component.productId : component.optionTag} has no catalog match.` }, { status: 409 })
      if (candidates.some(product => !product?.booksItemId || (!(Number(product.unitCost) > 0) && product.costQuality !== 'VERIFIED_ZERO'))) return NextResponse.json({ error: 'Every bundle option must have an exact Books item and authoritative cost.' }, { status: 409 })
    }
    const giftAttributesSupplied = giftReleaseRule !== undefined || giftTags !== undefined || giftSizes !== undefined || giftBundleRequiresShirt !== undefined || giftBundleComponents !== undefined
    const nextGiftAttributes = giftAttributesSupplied ? {
      ...existingAttributes,
      giftReleaseRule: normalizedGiftReleaseRule,
      giftTags: normalizeList(giftTags),
      giftSizes: normalizeList(giftSizes).map(item => item.toUpperCase()),
      giftBundleRequiresShirt: Boolean(giftBundleRequiresShirt),
      giftBundleComponents: normalizedComponents,
    } : undefined
    let zohoSynced = false

    // 2. If name, price or description text changed and we have item_id, update Zoho Books
    if (itemId && (name !== undefined || price !== undefined || descriptionText !== undefined)) {
      try {
        const token = await getZohoAccessToken()
        if (token) {
          const url = `https://www.zohoapis.${ZOHO_DC}/books/v3/items/${itemId}?organization_id=${ZOHO_ORGANIZATION_ID}`
          
          const zohoData: any = {}
          if (name) zohoData.name = name
          if (price !== undefined) zohoData.rate = price
          if (descriptionText !== undefined) zohoData.description = descriptionText

          const zohoRes = await fetch(url, { signal: AbortSignal.timeout(15000),
            method: "PUT",
            headers: {
              Authorization: `Zoho-oauthtoken ${token}`,
              "Content-Type": "application/json"
            },
            body: JSON.stringify(zohoData)
          })
          
          if (zohoRes.ok) {
            zohoSynced = true
          } else {
            console.warn(`Zoho item update returned non-ok status: ${zohoRes.status}`)
          }
        }
      } catch (err: any) {
        console.error("Failed to update Zoho Books item:", err.message)
      }
    }

    // Update merged local description
    if (descriptionText !== undefined) {
      parsedDesc.text = descriptionText
    }

    // 3. Update local Product database row
    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        name: name || undefined,
        price: price !== undefined ? parseFloat(price) : undefined,
        description: JSON.stringify(parsedDesc),
        size,
        application,
        manufacturer,
        vendor,
        qualityTier,
        subjectToVig: subjectToVig !== undefined ? Boolean(subjectToVig) : undefined,
        giftItem: giftItem !== undefined ? Boolean(giftItem) : undefined,
        attributes: nextGiftAttributes,
        showOnWeb: giftItem === true ? false : showOnWeb !== undefined ? Boolean(showOnWeb) : undefined
      }
    })

    return NextResponse.json({
      success: true,
      zohoSynced,
      product: updatedProduct
    })
  } catch (error: any) {
    console.error("Failed to update product:", error)
    return NextResponse.json({ error: "Failed to update product", details: error.message }, { status: 500 })
  }
}
