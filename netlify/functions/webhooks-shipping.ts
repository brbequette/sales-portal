import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { trackingNumber, packageId, status, carrier } = body

    if (!trackingNumber && !packageId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing trackingNumber or packageId" }) }
    }

    const pkg = await prisma.package.findFirst({
      where: {
        OR: [
          ...(packageId ? [{ id: packageId }] : []),
          ...(trackingNumber ? [{ trackingNumber: trackingNumber }] : []),
        ],
      },
    })

    if (!pkg) {
      return { statusCode: 200, headers: cors, body: JSON.stringify({ message: "Package record not found, webhook logged" }) }
    }

    let normalizedStatus = pkg.status
    const lowerStatus = (status || "").toLowerCase()
    
    if (lowerStatus.includes("deliver") || lowerStatus.includes("completed")) {
      normalizedStatus = "delivered"
    } else if (lowerStatus.includes("transit") || lowerStatus.includes("out for delivery") || lowerStatus.includes("shipped")) {
      normalizedStatus = "shipped"
    }

    const updatedPkg = await prisma.package.update({
      where: { id: pkg.id },
      data: {
        status: normalizedStatus,
        carrier: carrier || pkg.carrier,
        trackingNumber: trackingNumber || pkg.trackingNumber,
      },
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({
        success: true,
        message: "Package status updated successfully via Netlify serverless webhook",
        package: {
          id: updatedPkg.id,
          trackingNumber: updatedPkg.trackingNumber,
          status: updatedPkg.status,
        },
      })
    }
  } catch (err: any) {
    console.error("Netlify Shipping Webhook Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message })
    }
  }
}
