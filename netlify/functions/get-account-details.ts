import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { id } = event.queryStringParameters || {}

    if (!id) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing id parameter" })
      }
    }

    let account = null;

    try {
      // Try finding by zohoId first, then by internal id
      account = await prisma.account.findUnique({
        where: { zohoId: id },
        include: {
          invoices: { orderBy: { issueDate: 'desc' } },
          salesOrders: { orderBy: { orderDate: 'desc' } },
          quotes: { orderBy: { createdAt: 'desc' } },
          deals: { orderBy: { closingDate: 'desc' } },
          notes: { orderBy: { createdAt: 'desc' } },
          tasks: { orderBy: { dueDate: 'asc' } },
          contacts: true
        }
      })

      if (!account) {
        account = await prisma.account.findUnique({
          where: { id: id },
          include: {
            invoices: { orderBy: { issueDate: 'desc' } },
            salesOrders: { orderBy: { orderDate: 'desc' } },
            quotes: { orderBy: { createdAt: 'desc' } },
            deals: { orderBy: { closingDate: 'desc' } },
            notes: { orderBy: { createdAt: 'desc' } },
            tasks: { orderBy: { dueDate: 'asc' } },
            contacts: true
          }
        })
      }
    } catch (dbError) {
      console.warn("Database connection failed, falling back to mock data:", dbError)
    }

    if (!account) {
      return {
        statusCode: 404,
        headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
        body: JSON.stringify({ success: false, message: "Account not found" })
      }
    }

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({ success: true, account })
    }

  } catch (error: any) {
    console.error("Get Account Details Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
