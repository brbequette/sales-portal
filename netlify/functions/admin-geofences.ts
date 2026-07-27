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
    if (event.httpMethod === "GET") {
      const geofences = await prisma.geofenceLocation.findMany({
        orderBy: { createdAt: "desc" },
      })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, geofences }) }
    }

    if (event.httpMethod === "POST") {
      const body = JSON.parse(event.body || "{}")
      const { name, address, latitude, longitude, radiusMeters, isActive } = body

      if (!name || latitude == null || longitude == null) {
        return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Name, latitude, and longitude are required." }) }
      }

      const geofence = await prisma.geofenceLocation.create({
        data: {
          name,
          address: address || null,
          latitude: parseFloat(latitude),
          longitude: parseFloat(longitude),
          radiusMeters: parseInt(radiusMeters) || 150,
          isActive: isActive !== false,
        },
      })

      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true, geofence }) }
    }

    if (event.httpMethod === "DELETE") {
      const params = event.queryStringParameters || {}
      const id = params.id
      if (!id) return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing ID" }) }

      await prisma.geofenceLocation.delete({ where: { id } })
      return { statusCode: 200, headers: cors, body: JSON.stringify({ success: true }) }
    }

    return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method Not Allowed" }) }
  } catch (err: any) {
    console.error("Admin Geofences Function Error:", err)
    return { statusCode: 500, headers: cors, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
