import { withFunctionAuth } from "./lib/auth-middleware"
import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"

const authenticatedHandler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  
  if (event.httpMethod === "POST") {
    try {
      const { emailId, originalSubject, responseBody, category } = JSON.parse(event.body || "{}")
      if (!responseBody) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing responseBody" }) }
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
