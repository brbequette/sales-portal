import { authenticateFunction, withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  
  if (event.httpMethod === "POST") {
    try {
      const caller = await authenticateFunction(event)
      const { emailId, originalSubject, responseBody, category } = JSON.parse(event.body || "{}")
      if (!responseBody) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing responseBody" }) }
      }
      if (emailId) {
        const email = await prisma.email.findUnique({ where: { id: emailId }, select: { accountId: true, userId: true } })
        const role = String(caller.role || "").toLowerCase()
        const privileged = role.includes("admin") || role.includes("manager")
        const callerId = String(caller.dbId || caller.userId || "")
        const account = email?.accountId
          ? await prisma.account.findUnique({ where: { id: email.accountId }, select: { ownerId: true } })
          : null
        if (!email || (!privileged && email.userId !== callerId && account?.ownerId !== callerId)) {
          return { statusCode: 403, headers: corsHeaders, body: JSON.stringify({ success: false, error: "Forbidden" }) }
        }
      }
      const accepted = await prisma.acceptedResponse.create({
        data: { emailId, originalSubject, responseBody, category, useCount: 1 }
      })
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, accepted }) }
    } catch (err: any) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: err.message }) }
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) }
}

export const handler = withFunctionAuth(authenticatedHandler)
