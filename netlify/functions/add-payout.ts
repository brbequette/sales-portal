import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  const cors = { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: cors, body: JSON.stringify({ success: false, error: "Method not allowed" }) }
  }

  try {
    const body = JSON.parse(event.body || "{}")
    const { repId, amount, date, notes, method } = body

    if (!repId || amount === undefined) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing required fields: repId, amount" }) }
    }

    const payoutDate = date ? new Date(date) : new Date()

    const payout = await prisma.payout.create({
      data: {
        repId,
        amount: parseFloat(amount),
        date: payoutDate,
        method: method || "Check",
        notes: notes || null
      }
    })

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, payout })
    }
  } catch (err: any) {
    console.error("add-payout error:", err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: err.message })
    }
  }
}
