import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'

export async function PUT(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { id } = await params
    const body = await req.json()
    const { name, callType, content, isActive } = body

    const script = await prisma.callScript.update({
      where: { id },
      data: {
        ...(name && { name }),
        ...(callType && { callType }),
        ...(content && { content }),
        ...(isActive !== undefined && { isActive }),
      }
    })

    return NextResponse.json({ success: true, script })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const { id } = await params
    await prisma.callScript.delete({
      where: { id }
    })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
