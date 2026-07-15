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
        zohoId: true,
        canSendCampaigns: true,
        showOnSalesBoard: true,
        permissions: true,
        _count: { select: { accounts: true } }
      }
    })
    const mapped = users.map(u => ({ ...u, accountCount: (u as any)._count?.accounts || 0, _count: undefined }))
    return NextResponse.json({ success: true, users: mapped })
  } catch (error: any) {
    console.error("Error fetching users:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const body = await req.json()
    const { id, canSendCampaigns, showOnSalesBoard, permissions, role, name, email, zohoId } = body

    if (!id) {
      return NextResponse.json({ success: false, error: "Missing user ID" }, { status: 400 })
    }

    const updateData: any = {}
    if (canSendCampaigns !== undefined) updateData.canSendCampaigns = canSendCampaigns
    if (showOnSalesBoard !== undefined) updateData.showOnSalesBoard = showOnSalesBoard
    if (permissions !== undefined) updateData.permissions = permissions
    if (role !== undefined) updateData.role = role
    if (name !== undefined) updateData.name = name
    if (email !== undefined) updateData.email = email
    if (zohoId !== undefined) updateData.zohoId = zohoId || null  // empty string → null

    const user = await prisma.user.update({
      where: { id },
      data: updateData
    })

    return NextResponse.json({ success: true, user })
  } catch (error: any) {
    console.error("Error updating user:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, role, zohoId } = body

    if (!name || !email) {
      return NextResponse.json({ success: false, error: "Name and email are required" }, { status: 400 })
    }

    // Check for existing user by email or zohoId
    const existingByEmail = await prisma.user.findUnique({ where: { email } })
    if (existingByEmail) {
      return NextResponse.json({ success: false, error: `A user with email "${email}" already exists.` }, { status: 409 })
    }

    if (zohoId) {
      const existingByZoho = await prisma.user.findUnique({ where: { zohoId } })
      if (existingByZoho) {
        return NextResponse.json({ success: false, error: `A user with Zoho ID "${zohoId}" already exists (${existingByZoho.name || existingByZoho.email}).` }, { status: 409 })
      }
    }

    const user = await prisma.user.create({
      data: {
        name,
        email,
        role: role || "Sales Representative",
        zohoId: zohoId || null,
      }
    })

    return NextResponse.json({ success: true, user, message: `User "${name}" created. They can now log in via Zoho OAuth.` })
  } catch (error: any) {
    console.error("Error creating user:", error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
