import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  // Allow GET requests
  if (event.httpMethod !== "GET") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { zohoId, email } = event.queryStringParameters || {}

    if (!zohoId && !email) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Missing zohoId or email parameter" })
      }
    }

    let user = null
    let accounts = []

    try {
      // 1. Try to find the user by their Zoho CRM User ID
      if (zohoId) {
        user = await prisma.user.findUnique({
          where: { zohoId: zohoId }
        })
      }

      // 2. Fall back to finding them by email (e.g. for standalone logins)
      if (!user && email) {
        user = await prisma.user.findUnique({
          where: { email: email }
        })
      }

      if (!user) {
        console.log(`User not found in local DB. ZohoId: ${zohoId}, Email: ${email}. Auto-creating for demo...`)
        user = await prisma.user.create({
          data: {
            email: email || `${zohoId}@titandiamond.net`,
            zohoId: zohoId || `mock-zoho-${Date.now()}`,
            name: email ? email.split('@')[0] : 'Demo User',
            role: 'Sales Representative'
          }
        })
      }

      // 3. Fetch accounts owned by this user
      accounts = await prisma.account.findMany({
        where: { ownerId: user.id },
        orderBy: { name: 'asc' }
      })

      // 4. If user exists but has no accounts, auto-provision some for the demo
      if (accounts.length === 0) {
        console.log(`User ${user?.email} has no accounts. Auto-provisioning...`)
        await prisma.account.createMany({
          data: [
            { zohoId: `ACC-MOCK-1-${Date.now()}`, name: "Alpha Construction", industry: "Construction", status: "Update Status", ownerId: user.id },
            { zohoId: `ACC-MOCK-2-${Date.now()}`, name: "Beta Logistics", industry: "Logistics", status: "Personal", ownerId: user.id }
          ]
        })
        accounts = await prisma.account.findMany({
          where: { ownerId: user.id },
          orderBy: { name: 'asc' }
        })
      }
    } catch (dbError) {
      console.warn("Database connection failed, falling back to mock data:", dbError)
      // Fallback Mock Data if DB is offline
      accounts = [
        { id: 'mock-1', zohoId: 'ACC-MOCK-1', name: "Alpha Construction (Mock)", industry: "Construction", status: "Update Status", ownerId: 'mock-owner' },
        { id: 'mock-2', zohoId: 'ACC-MOCK-2', name: "Beta Logistics (Mock)", industry: "Logistics", status: "Personal", ownerId: 'mock-owner' }
      ]
    }

    return {
      statusCode: 200,
      headers: { 
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*" 
      },
      body: JSON.stringify({ success: true, accounts })
    }

  } catch (error: any) {
    console.error("Get Accounts Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
