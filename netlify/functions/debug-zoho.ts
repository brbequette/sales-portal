import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import { corsHeaders, handleOptions } from "./lib/cors"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  if (event.httpMethod === "OPTIONS") return handleOptions()

  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        email: true,
        zohoId: true,
        name: true,
        role: true
      }
    })
    const accountCount = await prisma.account.count()
    const invoiceCount = await prisma.invoice.count()

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ 
        success: true,
        users,
        accountCount,
        invoiceCount
      })
    }
  } catch (e: any) {
    return { 
      statusCode: 500, 
      headers: corsHeaders, 
      body: JSON.stringify({ success: false, error: e.message }) 
    }
  }
}
