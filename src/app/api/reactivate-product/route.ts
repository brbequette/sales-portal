import { NextResponse } from "next/server"
import { getZohoAccessToken, ZOHO_ORGANIZATION_ID, ZOHO_DC } from "../../../../netlify/functions/lib/zoho-auth"

const ORG_ID = ZOHO_ORGANIZATION_ID

export async function POST(req: Request) {
  try {
    const { sku } = await req.json()
    if (!sku) return NextResponse.json({ error: "Missing SKU" }, { status: 400 })

    const token = await getZohoAccessToken()
    const ZOHO_DC = process.env.ZOHO_DC || "com"

    // 1. Get the item ID from Zoho based on SKU
    const searchRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ORG_ID}&sku=${sku}`, { signal: AbortSignal.timeout(15000),
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    const searchData = await searchRes.json()
    
    if (searchData.code !== 0 || !searchData.items || searchData.items.length === 0) {
      return NextResponse.json({ error: "Item not found in Zoho" }, { status: 404 })
    }

    const itemId = searchData.items[0].item_id

    // 2. Mark it as active
    const activeRes = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items/${itemId}/active?organization_id=${ORG_ID}`, { signal: AbortSignal.timeout(15000),
      method: "POST",
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    const activeData = await activeRes.json()

    if (activeData.code !== 0) {
      return NextResponse.json({ error: "Failed to reactivate in Zoho: " + activeData.message }, { status: 400 })
    }

    return NextResponse.json({ success: true })
  } catch (error) {
    console.error("Failed to reactivate product:", error)
    return NextResponse.json({ error: "Failed to reactivate product" }, { status: 500 })
  }
}
