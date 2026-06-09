import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export const handler: Handler = async (event) => {
  const email = event.queryStringParameters?.email
  if (!email) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing email" })
    }
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "User not found" })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        id: user.zohoId || user.id,
        name: user.name,
        email: user.email,
        role: user.role
      })
    }
  } catch (error: any) {
    console.error("Error fetching user:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    }
  }
}
