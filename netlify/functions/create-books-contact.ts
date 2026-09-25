import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { prisma } from "./lib/prisma"
import { ensureBooksCustomer } from "../../src/lib/zoho-books-customer"

const authenticatedHandler: Handler = async (event) => {
  const cors = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  }

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers: cors, body: "" }
  if (event.httpMethod !== "POST") return { statusCode: 405, headers: cors, body: JSON.stringify({ error: "Method not allowed" }) }

  try {
    const caller = await authenticateFunction(event)
    const body = JSON.parse(event.body || "{}")
    const { accountId } = body

    if (!accountId) {
      return { statusCode: 400, headers: cors, body: JSON.stringify({ success: false, error: "Missing accountId" }) }
    }

    // Find account in DB
    const account = await prisma.account.findFirst({
      where: { OR: [{ id: accountId }, { zohoId: accountId }] },
      include: { contacts: true }
    })

    if (!account) {
      return { statusCode: 404, headers: cors, body: JSON.stringify({ success: false, error: "Account not found in local DB" }) }
    }

    const role = String(caller.role || "").toLowerCase()
    const privileged = role.includes("admin") || role.includes("manager")
    const callerId = String(caller.dbId || caller.userId || "")
    if (!privileged && account.ownerId !== callerId) {
      return { statusCode: 403, headers: cors, body: JSON.stringify({ success: false, error: "Forbidden" }) }
    }

    const result = await ensureBooksCustomer(account.id)
    const statusCode = result.state === "SUCCEEDED" ? 200 : result.state === "FAILED" ? 422 : 202
    return { statusCode, headers: cors, body: JSON.stringify({ success: result.state === "SUCCEEDED", providerState: result.state, booksCustomerId: result.booksCustomerId || null, code: result.code || null, message: result.message || null }) }

  } catch (error: any) {
    console.error("Create Books Contact Error:", error)
    return {
      statusCode: 500,
      headers: cors,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}

export const handler = withFunctionAuth(authenticatedHandler)
