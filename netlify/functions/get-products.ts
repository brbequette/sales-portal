import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { getZohoAccessToken } from "./lib/zoho-auth"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { reseed } = event.queryStringParameters || {}

    if (reseed === "true") {
      const token = await getZohoAccessToken()
      const ORG_ID = process.env.ZOHO_ORGANIZATION_ID || "664670946"
      const ZOHO_DC = process.env.ZOHO_DC || "com"

      let page = 1
      let hasMore = true
      let allItems: any[] = []

      while (hasMore) {
        const res = await fetch(`https://www.zohoapis.${ZOHO_DC}/books/v3/items?organization_id=${ORG_ID}&page=${page}&per_page=200`, {
          headers: { Authorization: `Zoho-oauthtoken ${token}` }
        })
        const data = await res.json()
        if (data.code !== 0) throw new Error(`Zoho Books Error: ${data.message}`)

        if (data.items && data.items.length > 0) {
          allItems.push(...data.items)
        }

        hasMore = data.page_context?.has_more_page || false
        page++
      }

      // Filter active items only
      const activeItems = allItems.filter(i => i.status === "active")

      const ops = activeItems.map(item => {
        const sku = item.sku || item.item_id
        const img = item.image_name ? `/api/zoho-image?sku=${encodeURIComponent(sku)}` : "/images/placeholder.png"

        const info = JSON.stringify({
          image: img,
          text: item.description || "",
          cost: item.purchase_rate || 0,
          vendor: item.vendor_name || item.cf_vendor || "",
          retail: item.rate || 0,
          pertinentInfo: ""
        })

        return prisma.product.upsert({
          where: { sku: sku },
          update: {
            name: item.name || "Unknown Product",
            description: info,
            price: item.rate || 0,
            category: item.category_name || "Uncategorized",
            stock: item.available_stock || item.stock_on_hand || 0
          },
          create: {
            sku: sku,
            name: item.name || "Unknown Product",
            description: info,
            price: item.rate || 0,
            category: item.category_name || "Uncategorized",
            stock: item.available_stock || item.stock_on_hand || 0
          }
        })
      })

      // Execute in batches of 50 to avoid connection timeouts
      for (let i = 0; i < ops.length; i += 50) {
        await prisma.$transaction(ops.slice(i, i + 50))
      }

      products = await prisma.product.findMany({
        orderBy: { category: 'asc' }
      })
    }

    const cors = {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type"
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, products })
    }

  } catch (error: any) {
    console.error("Get Products Error:", error)
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
