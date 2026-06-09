import { Handler } from "@netlify/functions"
import { getZohoAccessToken } from "./lib/zoho-auth"

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: "Method Not Allowed"
    }
  }

  try {
    const sku = event.queryStringParameters?.sku
    
    if (!sku) {
      return { statusCode: 400, body: "Missing SKU" }
    }

    const token = await getZohoAccessToken()
    if (!token) {
      return { statusCode: 500, body: "Zoho Authentication Failed" }
    }

    const ZOHO_DC = process.env.ZOHO_DC || 'com'
    const ORG_ID = process.env.ZOHO_ORGANIZATION_ID
    const baseUrl = `https://www.zohoapis.${ZOHO_DC}/books/v3`

    // Step 1: Resolve SKU to Item ID
    const searchRes = await fetch(`${baseUrl}/items?organization_id=${ORG_ID}&sku=${encodeURIComponent(sku)}`, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })
    
    if (!searchRes.ok) {
      return { statusCode: searchRes.status, body: "Failed to query Zoho Books" }
    }

    const searchData = await searchRes.json()
    if (!searchData.items || searchData.items.length === 0) {
      return { statusCode: 404, body: "Item not found" }
    }

    const item = searchData.items[0]
    if (!item.image_name) {
      return { statusCode: 404, body: "No image for item" }
    }

    // Step 2: Fetch the Image
    const imageUrl = `${baseUrl}/items/${item.item_id}/image?organization_id=${ORG_ID}`
    const imgRes = await fetch(imageUrl, {
      headers: { Authorization: `Zoho-oauthtoken ${token}` }
    })

    if (!imgRes.ok) {
      return { statusCode: imgRes.status, body: "Failed to fetch image from Zoho" }
    }

    // Proxy the image stream
    const contentType = imgRes.headers.get("content-type") || "image/jpeg"
    const buffer = await imgRes.arrayBuffer()

    return {
      statusCode: 200,
      headers: {
        "Content-Type": contentType,
        "Cache-Control": "public, max-age=86400, s-maxage=86400", // Cache for 24 hours
      },
      body: Buffer.from(buffer).toString('base64'),
      isBase64Encoded: true
    }

  } catch (err: any) {
    console.error("Error proxying Zoho image:", err)
    return { statusCode: 500, body: "Internal Server Error" }
  }
}
