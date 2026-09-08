import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { requireAdministrator } from '@/lib/auth-helpers'
import { normalizeScriptInput } from '@/lib/call-scripts'

export async function GET() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
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
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    const input = normalizeScriptInput(body)

    if (!input.name || !input.callType || !input.content) {
      return NextResponse.json({ success: false, error: 'Missing required fields' }, { status: 400 })
    }

    const script = await prisma.callScript.create({
      data: input
    })

    return NextResponse.json({ success: true, script })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
