import { NextResponse } from "next/server"
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url)
  const email = searchParams.get("email")

  if (!email) {
    return NextResponse.json({ error: "Missing email" }, { status: 400 })
  }

  try {
    const user = await prisma.user.findUnique({
      where: { email }
    })

    if (!user) {
      return NextResponse.json({ error: "User not found" }, { status: 404 })
    }

    return NextResponse.json({
      id: user.zohoId || user.id,
      name: user.name,
      email: user.email,
      role: user.role
    })
  } catch (error: any) {
    console.error("Error fetching user:", error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
