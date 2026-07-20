import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"

/**
 * Haversine distance between two GPS coordinates.
 * Returns distance in meters.
 */
function haversineDistance(
  lat1: number, lng1: number,
  lat2: number, lng2: number
): number {
  const R = 6371000 // Earth's radius in meters
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { userId, action, email, name, latitude, longitude, accuracy, source } = body
    const clockSource = source || 'manual' // 'geofence' or 'manual'

    if ((!userId && !email) || !action) {
      return NextResponse.json({ success: false, error: "Missing userId, email, or action" }, { status: 400 })
    }

    let finalUserId = userId
    if (email) {
      let dbUser = await prisma.user.findUnique({ where: { email } })
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: { email, name: name || "Zoho User", role: "AGENT", password: "" }
        })
      }
      finalUserId = dbUser.id
    }

    const ipAddress = req.headers.get("x-forwarded-for") || req.headers.get("x-real-ip") || req.headers.get("cf-connecting-ip") || "Unknown"

    const now = new Date()
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: 'America/Phoenix',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    })
    const parts = formatter.formatToParts(now)
    const ye = parts.find(p => p.type === 'year')?.value
    const mo = parts.find(p => p.type === 'month')?.value
    const da = parts.find(p => p.type === 'day')?.value
    const phoenixDate = `${ye}-${mo}-${da}`

    // --- Geofence validation ---
    let locationStatus: string = 'UNAVAILABLE'
    let locationName: string | null = null
    let distanceMeters: number | null = null

    if (latitude != null && longitude != null) {
      // Fetch active geofence locations
      const geofences = await (prisma as any).geofenceLocation?.findMany?.({ where: { isActive: true } }) || []

      if (geofences.length === 0) {
        // No geofences configured — GPS captured but no validation
        locationStatus = 'VERIFIED'
      } else {
        let nearest: any = null
        let minDist = Infinity

        for (const gf of geofences) {
          const dist = haversineDistance(latitude, longitude, gf.latitude, gf.longitude)
          if (dist < minDist) {
            minDist = dist
            nearest = gf
          }
        }

        distanceMeters = Math.round(minDist)
        locationName = nearest?.name || null

        if (nearest && minDist <= nearest.radiusMeters) {
          locationStatus = 'VERIFIED'
        } else {
          locationStatus = 'OUT_OF_RANGE'
        }
      }
    } else {
      locationStatus = latitude === null ? 'DENIED' : 'UNAVAILABLE'
    }

    // Build geo data for the appropriate clock action
    const isClockIn = action === 'clockIn'
    const geoData: Record<string, any> = {}

    if (isClockIn) {
      geoData.clockInLat = latitude ?? null
      geoData.clockInLng = longitude ?? null
      geoData.clockInAccuracy = accuracy ?? null
      geoData.clockInLocation = locationName
      geoData.locationStatus = locationStatus
      geoData.clockSource = clockSource
    } else {
      geoData.clockOutLat = latitude ?? null
      geoData.clockOutLng = longitude ?? null
      geoData.clockOutAccuracy = accuracy ?? null
      geoData.clockOutLocation = locationName
      geoData.clockSource = clockSource
    }

    const existing = await prisma.timeEntry.findUnique({
      where: {
        userId_date: { userId: finalUserId, date: phoenixDate }
      }
    })

    if (!existing) {
      // Geofence clock-out without an existing entry is invalid — skip
      if (action === 'clockOut' && clockSource === 'geofence') {
        return NextResponse.json({ success: true, skipped: true, reason: 'No active entry to clock out' })
      }
      const entry = await prisma.timeEntry.create({
        data: {
          userId: finalUserId,
          date: phoenixDate,
          clockIn: now,
          lastActivity: now,
          clockOut: null,
          manualClockOut: action === 'clockOut' ? now : null,
          ipAddress,
          ...geoData
        }
      })
      return NextResponse.json({ success: true, entry, locationStatus, locationName, distanceMeters })
    }

    // Geofence duplicate prevention:
    // - Don't re-clock-in if already clocked in today
    // - Don't re-clock-out if already manually clocked out
    if (clockSource === 'geofence') {
      if (action === 'clockIn' && !existing.manualClockOut && !existing.clockOut) {
        return NextResponse.json({ success: true, skipped: true, reason: 'Already clocked in today' })
      }
      if (action === 'clockOut' && (existing.manualClockOut || existing.clockOut)) {
        return NextResponse.json({ success: true, skipped: true, reason: 'Already clocked out today' })
      }
    }

    // Toggle existing entry
    const entry = await prisma.timeEntry.update({
      where: { id: existing.id },
      data: {
        manualClockOut: action === 'clockOut' ? now : null,
        ipAddress: ipAddress !== "Unknown" ? ipAddress : existing.ipAddress,
        ...geoData
      }
    })

    return NextResponse.json({ success: true, entry, locationStatus, locationName, distanceMeters })
  } catch (error: any) {
    console.error("Error toggling timeclock:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
