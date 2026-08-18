import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'

function isAdmin(session: any): boolean {
  const role = session?.user?.role?.toLowerCase() || ''
  return role.includes('admin') || role === 'administrator' || role.includes('collections') || role.includes('manager')
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const templates = await prisma.notificationTemplate.findMany({
      orderBy: { name: 'asc' }
    })
    return NextResponse.json({ templates })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { name, channel, subject, body, isActive } = await req.json()

    if (!name || !channel || !body) {
      return NextResponse.json({ error: 'name, channel, and body are required' }, { status: 400 })
    }

    const template = await prisma.notificationTemplate.create({
      data: { name, channel, subject, body, isActive: isActive ?? true }
    })

    return NextResponse.json({ template }, { status: 201 })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { id, name, channel, subject, body, isActive } = await req.json()

    if (!id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 })
    }

    const template = await prisma.notificationTemplate.update({
      where: { id },
      data: {
        ...(name !== undefined && { name }),
        ...(channel !== undefined && { channel }),
        ...(subject !== undefined && { subject }),
        ...(body !== undefined && { body }),
        ...(isActive !== undefined && { isActive })
      }
    })

    return NextResponse.json({ template })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

export async function DELETE(req: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (!isAdmin(session)) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  try {
    const { searchParams } = new URL(req.url)
    const id = searchParams.get('id')

    if (!id) {
      return NextResponse.json({ error: 'Template id is required' }, { status: 400 })
    }

    await prisma.notificationTemplate.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
