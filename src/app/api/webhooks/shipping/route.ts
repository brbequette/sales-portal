import { NextRequest, NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

// POST -- Webhook handler for shipping & carrier tracking status updates
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { trackingNumber, packageId, status, carrier, location, timestamp } = body

    if (!trackingNumber && !packageId) {
      return NextResponse.json({ error: "Missing trackingNumber or packageId" }, { status: 400 })
    }

    // Find package by tracking number or ID
    const pkg = await prisma.package.findFirst({
      where: {
        OR: [
          ...(packageId ? [{ id: packageId }] : []),
          ...(trackingNumber ? [{ trackingNumber: trackingNumber }] : []),
        ],
      },
    })

    if (!pkg) {
      return NextResponse.json({ message: "Package record not found, webhook logged" }, { status: 200 })
    }

    // Map carrier status to standard status
    let normalizedStatus = pkg.status
    const lowerStatus = (status || "").toLowerCase()
    
    if (lowerStatus.includes("deliver") || lowerStatus.includes("completed")) {
      normalizedStatus = "delivered"
    } else if (lowerStatus.includes("transit") || lowerStatus.includes("out for delivery") || lowerStatus.includes("shipped")) {
      normalizedStatus = "shipped"
    }

    // Update Package status
    const updatedPkg = await prisma.package.update({
      where: { id: pkg.id },
      data: {
        status: normalizedStatus,
        carrier: carrier || pkg.carrier,
        trackingNumber: trackingNumber || pkg.trackingNumber,
      },
    })

    return NextResponse.json({
      success: true,
      message: "Package status updated successfully",
      package: {
        id: updatedPkg.id,
        trackingNumber: updatedPkg.trackingNumber,
        status: updatedPkg.status,
      },
    })
  } catch (err: any) {
    console.error("Shipping Webhook Error:", err)
    return NextResponse.json({ error: err.message }, { status: 500 })
  }
}
