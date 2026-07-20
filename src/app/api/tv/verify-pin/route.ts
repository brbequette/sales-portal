import { NextResponse } from 'next/server'
import { getSystemSettings } from '@/lib/settings'

export async function POST(req: Request) {
  try {
    const { pin } = await req.json()
    const settings = await getSystemSettings()
    const isValid = pin === settings.tv_pin
    return NextResponse.json({ success: true, valid: isValid })
  } catch (error: any) {
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
