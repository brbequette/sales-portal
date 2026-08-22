import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/geofences/active
 * Returns only active geofence locations for client-side geolocation checking.
 * Authentication is required because coordinates identify company locations.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
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
