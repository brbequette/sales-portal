import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const users = await prisma.user.findMany({
      orderBy: { name: 'asc' },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        canSendCampaigns: true
      }
    })
    return NextResponse.json({ success: true, users })
  } catch (error: any) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, canSendCampaigns } = body

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing user ID" }, { status: 400 })
    }

    const user = await prisma.user.update({
      where: { id },
      data: { canSendCampaigns }
    })

    return NextResponse.json({ success: true, user })
  } catch (error: any) {
    console.error("Error updating user:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
