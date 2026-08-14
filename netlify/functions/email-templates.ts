import { Handler } from "@netlify/functions"
import { corsHeaders, handleOptions } from "./lib/cors"
import { prisma } from "./lib/prisma"

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()
  
  if (event.httpMethod === "GET") {
    try {
      const templates = await prisma.emailTemplate.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' }
      })
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, templates }) }
    } catch (err: any) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: err.message }) }
    }
  }
  
  if (event.httpMethod === "POST") {
    try {
      const { name, subject, body, category } = JSON.parse(event.body || "{}")
      if (!name || !subject || !body) {
        return { statusCode: 400, headers: corsHeaders, body: JSON.stringify({ error: "Missing required fields" }) }
      }
      const template = await prisma.emailTemplate.create({
        data: { name, subject, body, category }
      })
      return { statusCode: 200, headers: corsHeaders, body: JSON.stringify({ success: true, template }) }
    } catch (err: any) {
      return { statusCode: 500, headers: corsHeaders, body: JSON.stringify({ success: false, error: err.message }) }
    }
  }

  return { statusCode: 405, headers: corsHeaders, body: JSON.stringify({ error: "Method Not Allowed" }) }
}
