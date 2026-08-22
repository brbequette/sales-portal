import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  try {
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const payoutId = body.payoutId || event.queryStringParameters?.payoutId

    if (!payoutId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing required field: payoutId" }) }
    }

    await prisma.payout.delete({
      where: { id: payoutId }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true })
    }
  } catch (err: any) {
    console.error("delete-payout error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
