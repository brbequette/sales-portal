import { NextResponse } from "next/server"
import { checkAccountOwnership } from "@/lib/auth-helpers"
import { prisma } from "@/lib/prisma"

export async function GET() {
  const auth = await checkAccountOwnership(undefined)
  if (!auth.authorized) return auth.errorResponse

  try {
    const templates = await prisma.campaignTemplate.findMany({
      select: {
        id: true,
        name: true,
        content: true,
        imageUrl: true,
        channel: true,
        updatedAt: true,
      },
      orderBy: { updatedAt: "desc" },
    })
    return NextResponse.json({ success: true, templates })
  } catch (error) {
    console.error("Unable to load campaign templates", error)
    return NextResponse.json({ success: false, error: "Unable to load campaign templates" }, { status: 500 })
  }
}
