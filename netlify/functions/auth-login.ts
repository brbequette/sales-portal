import { Handler } from "@netlify/functions"
import { PrismaClient } from "@prisma/client"
import bcrypt from "bcryptjs"

const prisma = new PrismaClient()

export const handler: Handler = async (event, context) => {
  if (event.httpMethod !== "POST") {
    return {
      statusCode: 405,
      body: JSON.stringify({ success: false, message: "Method Not Allowed" })
    }
  }

  try {
    const { email, password } = JSON.parse(event.body || "{}")

    if (!email || !password) {
      return {
        statusCode: 400,
        body: JSON.stringify({ success: false, message: "Email and password are required" })
      }
    }

    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user || !user.password) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: "Invalid email or password" })
      }
    }

    const isPasswordValid = await bcrypt.compare(password, user.password)
    if (!isPasswordValid) {
      return {
        statusCode: 401,
        body: JSON.stringify({ success: false, message: "Invalid email or password" })
      }
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        success: true,
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          role: user.role
        }
      })
    }
  } catch (error: any) {
    console.error("Auth Login Error:", error)
    return {
      statusCode: 500,
      body: JSON.stringify({ success: false, error: error.message })
    }
  }
}
