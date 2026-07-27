import { Handler } from '@netlify/functions'
import { prisma } from './lib/prisma'

function haversineDistance(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000
  const toRad = (deg: number) => (deg * Math.PI) / 180
  const dLat = toRad(lat2 - lat1)
  const dLng = toRad(lng2 - lng1)
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a))
}

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Content-Type': 'application/json'
}

export const handler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    const body = JSON.parse(event.body || '{}')
    const { userId, action, email, name, latitude, longitude, accuracy, source } = body
    const clockSource = source || 'manual'

    if ((!userId && !email) || !action) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing userId, email, or action' }) }
    }

    // Resolve db user
    let finalUserId = userId
    let dbUser = null
    if (email) {
      dbUser = await prisma.user.findUnique({ where: { email } })
      if (!dbUser) {
        dbUser = await prisma.user.create({
          data: { email, name: name || 'Zoho User', role: 'AGENT', password: '' }
        })
      }
      finalUserId = dbUser.id
    }

    const ipAddress = event.headers['x-forwarded-for'] || event.headers['client-ip'] || 'Unknown'

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

    // Geofence check
    let locationStatus: string = 'UNAVAILABLE'
    let locationName: string | null = null
    let distanceMeters: number | null = null

    if (latitude != null && longitude != null) {
      const geofences = await (prisma as any).geofenceLocation?.findMany?.({ where: { isActive: true } }) || []
      if (geofences.length === 0) {
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
        locationStatus = (nearest && minDist <= nearest.radiusMeters) ? 'VERIFIED' : 'OUT_OF_RANGE'
      }
    } else {
      locationStatus = latitude === null ? 'DENIED' : 'UNAVAILABLE'
    }

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

    // Check existing entry by (userId, date) or by user's active open entry
    let existing = await prisma.timeEntry.findUnique({
      where: { userId_date: { userId: finalUserId, date: phoenixDate } }
    })

    if (!existing) {
      // Fallback search by date if userId is mapped
      existing = await prisma.timeEntry.findFirst({
        where: {
          date: phoenixDate,
          OR: [
            { userId: finalUserId },
            { user: { email: email || '' } }
          ]
        }
      })
    }

    if (!existing) {
      if (action === 'clockOut' && clockSource === 'geofence') {
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, skipped: true, reason: 'No active entry to clock out' }) }
      }
      const entry = await prisma.timeEntry.create({
        data: {
          userId: finalUserId,
          date: phoenixDate,
          clockIn: now,
          lastActivity: now,
          clockOut: action === 'clockOut' ? now : null,
          manualClockOut: action === 'clockOut' ? now : null,
          ipAddress,
          ...geoData
        }
      })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, entry, locationStatus, locationName, distanceMeters }) }
    }

    // Toggle existing entry
    const entry = await prisma.timeEntry.update({
      where: { id: existing.id },
      data: {
        clockOut: action === 'clockOut' ? now : (existing.clockOut || null),
        manualClockOut: action === 'clockOut' ? now : (existing.manualClockOut || null),
        lastActivity: now,
        ipAddress: ipAddress !== 'Unknown' ? ipAddress : existing.ipAddress,
        ...geoData
      }
    })

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, entry, locationStatus, locationName, distanceMeters }) }
  } catch (err: any) {
    console.error('Error toggling timeclock:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
