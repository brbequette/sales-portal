import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    let products = await prisma.product.findMany({
      orderBy: { category: 'asc' }
    })

    // Auto-seed for demo if empty
    if (products.length === 0) {
      const demoProducts = [
        { sku: "TD-BL-100", name: "Premium Turbo Blade 4.5\"", description: "Fast cutting for granite & concrete.", price: 45.00, category: "Blades", stock: 100 },
        { sku: "TD-BL-102", name: "Continuous Rim Blade 7\"", description: "Smooth cuts on tile and porcelain.", price: 65.00, category: "Blades", stock: 85 },
        { sku: "TD-PP-200", name: "Wet Polishing Pad Set (50-3000 grit)", description: "Complete set of 4\" wet pads.", price: 120.00, category: "Polishing", stock: 50 },
        { sku: "TD-CB-300", name: "Dry Core Bit 1-3/8\"", description: "Laser welded dry core bit.", price: 85.00, category: "Core Bits", stock: 30 },
        { sku: "TD-CW-400", name: "Cup Wheel Double Row 4\"", description: "Heavy duty grinding cup wheel.", price: 55.00, category: "Grinding", stock: 120 }
      ]

      await prisma.product.createMany({
        data: demoProducts
      })

      products = await prisma.product.findMany({
        orderBy: { category: 'asc' }
      })
    }

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ success: true, products })
    }

  } catch (error: any) {
    console.error("Get Products Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
