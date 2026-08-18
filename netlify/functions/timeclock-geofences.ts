import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from '@netlify/functions'
import { prisma } from './lib/prisma'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Content-Type': 'application/json'
}

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    let geofences: any[] = []
    try {
      geofences = await (prisma as any).geofenceLocation.findMany({
        where: { isActive: true },
        select: { id: true, name: true, latitude: true, longitude: true, radiusMeters: true },
        orderBy: { name: 'asc' }
      })
    } catch {}

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, geofences }) }
  } catch (err: any) {
    console.error('Error fetching geofences:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
