import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from '@netlify/functions'
import { prisma } from './lib/prisma'

const headers = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PATCH, OPTIONS',
  'Content-Type': 'application/json'
}

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' }
  }

  try {
    if (event.httpMethod === 'GET') {
      const params = event.queryStringParameters || {}
      const month = params.month

      const where: any = {}
      if (month) where.date = { startsWith: month }

      const entries = await prisma.timeEntry.findMany({
        where,
        take: 300,
        orderBy: { date: 'desc' },
        include: {
          user: { select: { id: true, name: true, email: true } },
          changeRequests: { orderBy: { createdAt: 'desc' } }
        }
      })

      let geofences: any[] = []
      try {
        geofences = await (prisma as any).geofenceLocation.findMany({ orderBy: { createdAt: 'desc' } })
      } catch {}

      const processedEntries = entries.map((entry: any) => {
        let inactivityPeriods = []
        try {
          if (entry.inactivityPeriods) {
            inactivityPeriods = typeof entry.inactivityPeriods === 'string'
              ? JSON.parse(entry.inactivityPeriods)
              : (Array.isArray(entry.inactivityPeriods) ? entry.inactivityPeriods : [])
          }
        } catch {}

        const effectiveOut = entry.manualClockOut || entry.clockOut
        const active = !effectiveOut

        return {
          ...entry,
          active,
          clockOut: effectiveOut,
          inactivityPeriods
        }
      })

      return { statusCode: 200, headers, body: JSON.stringify({ success: true, entries: processedEntries, geofences }) }
    }

    if (event.httpMethod === 'PATCH') {
      const body = JSON.parse(event.body || '{}')
      const { type } = body

      if (type === 'HANDLE_REQUEST') {
        const { requestId, status, manualClockIn, manualClockOut, timeEntryId } = body
        await prisma.$transaction(async (tx) => {
          const updatedReq = await tx.timeChangeRequest.update({
            where: { id: requestId },
            data: { status }
          })

          if (status === 'APPROVED') {
            if (timeEntryId) {
              const updateData: any = {}
              if (manualClockIn) updateData.manualClockIn = new Date(manualClockIn)
              if (manualClockOut) updateData.manualClockOut = new Date(manualClockOut)
              if (Object.keys(updateData).length > 0) {
                await tx.timeEntry.update({ where: { id: timeEntryId }, data: updateData })
              }
            } else {
              if (!manualClockIn || !manualClockOut) throw new Error('Both clock in and clock out required')
              const d = new Date(manualClockIn)
              const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

              const newEntry = await tx.timeEntry.create({
                data: {
                  userId: updatedReq.userId,
                  date: dateStr,
                  clockIn: new Date(manualClockIn),
                  lastActivity: new Date(manualClockOut),
                  clockOut: new Date(manualClockOut),
                  manualClockIn: new Date(manualClockIn),
                  manualClockOut: new Date(manualClockOut)
                }
              })
              await tx.timeChangeRequest.update({ where: { id: requestId }, data: { timeEntryId: newEntry.id } })
            }
          }
        })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
      }

      if (type === 'MANUAL_OVERRIDE') {
        const { timeEntryId, manualClockIn, manualClockOut } = body
        const updateData: any = {}
        if (manualClockIn !== undefined) updateData.manualClockIn = manualClockIn ? new Date(manualClockIn) : null
        if (manualClockOut !== undefined) updateData.manualClockOut = manualClockOut ? new Date(manualClockOut) : null

        const entry = await prisma.timeEntry.update({ where: { id: timeEntryId }, data: updateData })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, entry }) }
      }

      if (type === 'GEOFENCE_CREATE') {
        const { name, address, latitude, longitude, radiusMeters } = body
        const location = await (prisma as any).geofenceLocation.create({
          data: { name, address: address || null, latitude, longitude, radiusMeters: radiusMeters || 150 }
        })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, location }) }
      }

      if (type === 'GEOFENCE_UPDATE') {
        const { id, name, address, latitude, longitude, radiusMeters, isActive } = body
        const location = await (prisma as any).geofenceLocation.update({
          where: { id },
          data: {
            ...(name !== undefined && { name }),
            ...(address !== undefined && { address }),
            ...(latitude !== undefined && { latitude }),
            ...(longitude !== undefined && { longitude }),
            ...(radiusMeters !== undefined && { radiusMeters }),
            ...(isActive !== undefined && { isActive }),
          }
        })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true, location }) }
      }

      if (type === 'GEOFENCE_DELETE') {
        const { id } = body
        await (prisma as any).geofenceLocation.delete({ where: { id } })
        return { statusCode: 200, headers, body: JSON.stringify({ success: true }) }
      }

      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Invalid type' }) }
    }

    if (event.httpMethod === 'POST') {
      const body = JSON.parse(event.body || '{}')
      const { userId, manualClockIn, manualClockOut } = body
      if (!userId || !manualClockIn || !manualClockOut) {
        return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) }
      }

      const d = new Date(manualClockIn)
      const dateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

      const newEntry = await prisma.timeEntry.create({
        data: {
          userId,
          date: dateStr,
          clockIn: new Date(manualClockIn),
          lastActivity: new Date(manualClockOut),
          clockOut: new Date(manualClockOut),
          manualClockIn: new Date(manualClockIn),
          manualClockOut: new Date(manualClockOut)
        }
      })
      return { statusCode: 200, headers, body: JSON.stringify({ success: true, entry: newEntry }) }
    }

    return { statusCode: 405, headers, body: JSON.stringify({ success: false, error: 'Method not allowed' }) }
  } catch (err: any) {
    console.error('Timeclock Admin Function Error:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) }
  }
}

export const handler = withFunctionAuth(authenticatedHandler, { requireAdmin: true })
