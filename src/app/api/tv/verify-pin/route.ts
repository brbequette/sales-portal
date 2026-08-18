import { NextResponse } from 'next/server'
import { getSystemSettings } from '@/lib/settings'

export async function POST(req: Request) {
  try {
    let pin = ''
    try {
      const body = await req.json()
      pin = body?.pin !== undefined ? String(body.pin).trim() : ''
    } catch {
      pin = ''
    }

    if (!pin) {
      return NextResponse.json({ success: true, valid: false, message: 'PIN is required' })
    }

    const settings = await getSystemSettings()
    const configuredPin = String(settings.tv_pin || '8321').trim()

    // Match either the configured TV PIN or default system PIN (8321)
    const isValid = pin === configuredPin || pin === '8321'

    return NextResponse.json({ success: true, valid: isValid })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    console.error('TV verify-pin POST error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url)
    const pin = (searchParams.get('pin') || '').trim()

    if (!pin) {
      return NextResponse.json({ success: true, valid: false, message: 'PIN query parameter is required' })
    }

    const settings = await getSystemSettings()
    const configuredPin = String(settings.tv_pin || '8321').trim()
    const isValid = pin === configuredPin || pin === '8321'

    return NextResponse.json({ success: true, valid: isValid })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    console.error('TV verify-pin GET error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}
