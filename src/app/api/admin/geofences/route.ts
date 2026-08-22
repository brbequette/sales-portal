import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

/**
 * GET /api/admin/geofences
 * Return all geofence locations (active and inactive) for admin management.
 */
export async function GET() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const geofences = await prisma.geofenceLocation.findMany({
      orderBy: { createdAt: "desc" },
    })
    return NextResponse.json({ success: true, geofences })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * POST /api/admin/geofences
 * Create a new geofence location.
 */
export async function POST(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { name, address, latitude, longitude, radiusMeters, isActive } = body

    if (!name || latitude == null || longitude == null) {
      return NextResponse.json(
        { success: false, error: "Name, latitude, and longitude are required." },
        { status: 400 }
      )
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

    return NextResponse.json({ success: true, geofence })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * PUT /api/admin/geofences
 * Update a geofence location by id.
 */
export async function PUT(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const { id, name, address, latitude, longitude, radiusMeters, isActive } = body

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Geofence id is required." },
        { status: 400 }
      )
    }

    const geofence = await prisma.geofenceLocation.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(address !== undefined && { address: address || null }),
        ...(latitude !== undefined && { latitude: parseFloat(latitude) }),
        ...(longitude !== undefined && { longitude: parseFloat(longitude) }),
        ...(radiusMeters !== undefined && { radiusMeters: parseInt(radiusMeters) || 150 }),
        ...(isActive !== undefined && { isActive }),
      },
    })

    return NextResponse.json({ success: true, geofence })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}

/**
 * DELETE /api/admin/geofences
 * Delete a geofence location by id (passed as ?id=xxx query param).
 */
export async function DELETE(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { searchParams } = new URL(req.url)
    const id = searchParams.get("id")

    if (!id) {
      return NextResponse.json(
        { success: false, error: "Geofence id is required." },
        { status: 400 }
      )
    }

    await prisma.geofenceLocation.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json(
      { success: false, error: error.message },
      { status: 500 }
    )
  }
}
