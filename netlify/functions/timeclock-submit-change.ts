import { Handler } from '@netlify/functions'
import { prisma } from './lib/prisma'

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
    const { timeEntryId, userId, userEmail, requestedClockIn, requestedClockOut, reason, notes } = body

    if ((!timeEntryId && !requestedClockIn) || (!userId && !userEmail) || !reason) {
      return { statusCode: 400, headers, body: JSON.stringify({ success: false, error: 'Missing required fields' }) }
    }

    let dbUserId = userId
    if (userEmail) {
      const user = await prisma.user.findUnique({ where: { email: userEmail } })
      if (user) dbUserId = user.id
    }

    const request = await prisma.timeChangeRequest.create({
      data: {
        timeEntryId: timeEntryId || null,
        userId: dbUserId,
        requestedClockIn: requestedClockIn ? new Date(requestedClockIn) : null,
        requestedClockOut: requestedClockOut ? new Date(requestedClockOut) : null,
        reason,
        notes,
        status: 'PENDING'
      }
    })

    return { statusCode: 200, headers, body: JSON.stringify({ success: true, request }) }
  } catch (err: any) {
    console.error('Error submitting time change request:', err)
    return { statusCode: 500, headers, body: JSON.stringify({ success: false, error: err.message }) }
  }
}
