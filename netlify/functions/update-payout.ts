import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "GET, POST, PATCH, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type"
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  if (event.httpMethod !== "PATCH") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: "Method not allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { payoutId, amount, notes } = body

    if (!payoutId || amount === undefined) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing required fields: payoutId, amount" }) }
    }

    const payout = await prisma.payout.update({
      where: { id: payoutId },
      data: {
        amount: parseFloat(amount),
        notes: notes || null
      }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, payout })
    }
  } catch (err: any) {
    console.error("update-payout error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
