/**
 * Geolocation utilities for GPS-based timeclock geofencing.
 * GPS is captured ONLY at clock-in and clock-out — not tracked continuously.
 */

export interface GeoPosition {
  latitude: number
  longitude: number
  accuracy: number // meters
}

export interface GeofenceLocation {
  id: string
  name: string
  address?: string
  latitude: number
  longitude: number
  radiusMeters: number
}

export interface GeofenceResult {
  status: 'VERIFIED' | 'OUT_OF_RANGE' | 'DENIED' | 'UNAVAILABLE'
  nearestLocation?: GeofenceLocation
  distanceMeters?: number
  position?: GeoPosition
}

/**
 * Get current GPS position from the browser.
 * Returns null if permission denied or unavailable.
 */
export function getCurrentPosition(timeoutMs = 10000): Promise<GeoPosition | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({
        latitude: pos.coords.latitude,
        longitude: pos.coords.longitude,
        accuracy: pos.coords.accuracy,
      }),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: timeoutMs, maximumAge: 30000 }
    )
  })
}

/**
 * Calculate distance between two GPS coordinates using the Haversine formula.
 * Returns distance in meters.
 */
export function haversineDistance(
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

/**
 * Check if a position is within any geofence.
 * Returns the nearest geofence and whether the position is within its radius.
 */
export function checkGeofences(
  position: GeoPosition,
  locations: GeofenceLocation[]
): GeofenceResult {
  if (!locations.length) {
    return { status: 'VERIFIED', position } // No geofences configured = always verified
  }

  let nearest: GeofenceLocation | undefined
  let minDistance = Infinity

  for (const loc of locations) {
    const dist = haversineDistance(position.latitude, position.longitude, loc.latitude, loc.longitude)
    if (dist < minDistance) {
      minDistance = dist
      nearest = loc
    }
  }

  return {
    status: nearest && minDistance <= nearest.radiusMeters ? 'VERIFIED' : 'OUT_OF_RANGE',
    nearestLocation: nearest,
    distanceMeters: Math.round(minDistance),
    position,
  }
}
