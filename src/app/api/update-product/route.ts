import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "../../../../netlify/functions/lib/zoho-auth"

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { id, name, price, descriptionText, size, application, manufacturer, vendor, qualityTier } = data

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

          const zohoRes = await fetch(url, {
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
        qualityTier
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
