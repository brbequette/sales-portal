import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"

const initialAssets = [
  { title: "2024 Product Catalog", type: "PDF", category: "Brochures", url: "https://titandiamond.net/catalog2024.pdf", size: "4.2 MB" },
  { title: "Premium Turbo Blade Specs", type: "PDF", category: "Spec Sheets", url: "https://titandiamond.net/specs/turbo-blade.pdf", size: "1.1 MB" },
  { title: "Wet Polishing Pads Promo", type: "Image", category: "Social Media", url: "https://titandiamond.net/promo/wet-pads.jpg", size: "800 KB" },
  { title: "How to use Dry Core Bits", type: "Video", category: "Training", url: "https://titandiamond.net/training/dry-core-bits.mp4", size: "125 MB" },
  { title: "Titan Diamond Logo Pack", type: "ZIP", category: "Branding", url: "https://titandiamond.net/assets/logo-pack.zip", size: "12 MB" },
  { title: "Concrete Saw Safety Guidelines", type: "PDF", category: "Training", url: "https://titandiamond.net/docs/saw-safety.pdf", size: "2.5 MB" },
]

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    let assets = await prisma.mediaAsset.findMany({
      orderBy: { createdAt: 'desc' }
    })

    if (assets.length === 0) {
      console.log("Seeding default media assets...")
      await prisma.mediaAsset.createMany({
        data: initialAssets
      })
      assets = await prisma.mediaAsset.findMany({
        orderBy: { createdAt: 'desc' }
      })
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*"
      },
      body: JSON.stringify({ success: true, assets })
    }

  } catch (error: any) {
    console.error("Get Media Assets Error:", error)
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
