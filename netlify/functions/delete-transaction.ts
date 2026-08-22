import { Handler } from "@netlify/functions"

import { prisma } from "./lib/prisma"
import { authenticateFunction, authErrorResponse } from "./lib/auth-middleware"

export const handler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    await authenticateFunction(event, { requireAdmin: true })
  } catch (error) {
    return authErrorResponse(error, cors)
  }

  let body: any = {}
  try {
    body = JSON.parse(event.body || "{}")
  } catch (e) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid JSON" }) }
  }

  const { type, id } = body
  if (!id || !type) {
    return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Missing type or id" }) }
  }

  try {
    if (type === "Quote") {
      await prisma.quote.delete({ where: { id: id } })
    } else if (type === "SalesOrder") {
      await prisma.salesOrder.delete({ where: { id: id } })
    } else {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ error: "Invalid type" }) }
    }

    return {
      statusCode: 200,
      headers: cors,
      body: JSON.stringify({ success: true, message: `${type} successfully deleted.` }),
    }
  } catch (err: any) {
    console.error('delete-transaction error:', err)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ error: err.message || "Failed to delete transaction" }),
    }
  }
}
