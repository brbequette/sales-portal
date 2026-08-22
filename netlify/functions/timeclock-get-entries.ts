import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    const params = event.queryStringParameters || {}
    const userId = params.userId
    const email = params.email
    const month = params.month

    const userConditions: any[] = []
    if (userId) userConditions.push({ userId })
    if (email) {
      userConditions.push({ user: { email } })
      const dbUser = await prisma.user.findUnique({ where: { email } })
      if (dbUser) userConditions.push({ userId: dbUser.id })
    }

    const where: any = {}
    if (userConditions.length > 0) {
      where.OR = userConditions
    }
    if (month) where.date = { startsWith: month }

    const entries = await prisma.timeEntry.findMany({
      where,
      take: 200,
      orderBy: { date: 'desc' },
      include: {
        changeRequests: {
          orderBy: { createdAt: 'desc' }
        }
      }
    })

    const processedEntries = entries.map(entry => {
      let inactivityPeriods = []
      try {
        if (entry.inactivityPeriods) {
          inactivityPeriods = typeof entry.inactivityPeriods === "string" 
            ? JSON.parse(entry.inactivityPeriods) 
            : (Array.isArray(entry.inactivityPeriods) ? entry.inactivityPeriods : [])
        }
      } catch (e) {}

      const effectiveOut = entry.manualClockOut || entry.clockOut
      const active = !effectiveOut

      return {
        ...entry,
        active,
        clockOut: effectiveOut,
        inactivityPeriods
      }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, entries: processedEntries })
    }
  } catch (err: any) {
    console.error("Timeclock Entries Function Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
