import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"

export const dynamic = "force-dynamic"

/**
 * GET /api/timeclock/geofences
 * Returns active geofence locations for the client-side monitor.
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions)
    if (!session?.user) return NextResponse.json({ success: false, error: "Authentication required" }, { status: 401 })
    let geofences: any[] = []
    try {
      geofences = await (prisma as any).geofenceLocation.findMany({
        where: { isActive: true },
        select: {
          id: true,
          name: true,
          latitude: true,
          longitude: true,
          radiusMeters: true,
        },
        orderBy: { name: 'asc' }
      })
    } catch {
      // Table may not exist yet
    }
    return NextResponse.json({ success: true, geofences })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
