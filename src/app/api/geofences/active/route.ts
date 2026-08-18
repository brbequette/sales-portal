import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

export const dynamic = "force-dynamic"

/**
 * GET /api/geofences/active
 * Returns only active geofence locations for client-side geolocation checking.
 * This is a public endpoint (no admin auth required).
 */
export async function GET() {
  try {
    const geofences = await prisma.geofenceLocation.findMany({
      where: { isActive: true },
      select: {
        id: true,
        name: true,
        address: true,
        latitude: true,
        longitude: true,
        radiusMeters: true,
      },
      orderBy: { name: "asc" },
    })
    return NextResponse.json({ success: true, geofences })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
