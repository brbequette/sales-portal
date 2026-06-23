import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const scripts = await prisma.callScript.findMany({
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, scripts })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, callType, content, isActive } = body

    if (!name || !callType || !content) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const script = await prisma.callScript.create({
      data: {
        name,
        callType,
        content,
        isActive: isActive !== undefined ? isActive : true
      }
    })

    return NextResponse.json({ success: true, script })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
