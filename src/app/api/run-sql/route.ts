import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function POST(req: Request) {
  try {
    const { sql } = await req.json()
    if (!sql) return NextResponse.json({ error: 'No SQL provided' }, { status: 400 })

    await prisma.$executeRawUnsafe(sql)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
