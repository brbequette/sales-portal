import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 204, headers: cors, body: "" }
  }

  try {
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  try {
    const [callLogs, smsLogs] = await Promise.all([
      prisma.callLog.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          account: { select: { id: true, name: true, zohoId: true } },
          author: { select: { id: true, name: true, email: true } }
        }
      }),
      prisma.smsMessage.findMany({
        orderBy: { createdAt: 'desc' },
        take: 300,
        include: {
          account: { select: { id: true, name: true, zohoId: true } },
          author: { select: { id: true, name: true, email: true } }
        }
      })
    ])

    const unifiedLogs = [
      ...callLogs.map(call => ({
        id: call.id,
        type: 'CALL',
        timestamp: call.createdAt,
        direction: call.direction,
        fromNumber: call.fromNumber,
        toNumber: call.toNumber,
        duration: call.duration,
        status: call.status,
        content: call.notes || null,
        account: call.account,
        author: call.author,
      })),
      ...smsLogs.map(sms => ({
        id: sms.id,
        type: 'SMS',
        timestamp: sms.createdAt,
        direction: sms.direction,
        fromNumber: sms.fromNumber,
        toNumber: sms.toNumber,
        duration: null,
        status: 'completed',
        content: sms.body || null,
        account: sms.account,
        author: sms.author,
      }))
    ].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, logs: unifiedLogs })
    }
  } catch (err: any) {
    console.error("Admin Communications Function Error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
