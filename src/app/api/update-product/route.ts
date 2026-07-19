import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export async function POST(req: Request) {
  try {
    const data = await req.json()
    const { id, size, application, manufacturer, vendor, qualityTier } = data

    if (!id) {
      return NextResponse.json({ error: "Missing product ID" }, { status: 400 })
    }

    const updatedProduct = await prisma.product.update({
      where: { id },
      data: {
        size,
        application,
        manufacturer,
        vendor,
        qualityTier
      }
    })

    return NextResponse.json(updatedProduct)
  } catch (error) {
    console.error("Failed to update product:", error)
    return NextResponse.json({ error: "Failed to update product" }, { status: 500 })
  }
}
