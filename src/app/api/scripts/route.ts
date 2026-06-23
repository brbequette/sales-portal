import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET() {
  try {
    const scripts = await prisma.callScript.findMany({
      where: { isActive: true },
      orderBy: { createdAt: 'desc' }
    })
    return NextResponse.json({ success: true, scripts })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
