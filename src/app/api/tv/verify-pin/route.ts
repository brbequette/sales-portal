import { NextResponse } from 'next/server'
import { getSystemSettings, DEFAULT_SETTINGS } from '@/lib/settings'

async function resolveConfiguredPin(): Promise<string> {
  try {
    const settings = await getSystemSettings()
    return String(settings?.tv_pin || DEFAULT_SETTINGS.tv_pin || '8321').trim()
  } catch (err) {
    console.warn('Failed to retrieve system settings for tv_pin, defaulting to 8321:', err)
    return '8321'
  }
}

export async function POST(req: Request) {
  try {
    let pin = ''
    try {
      const body = await req.json()
      pin = body?.pin !== undefined && body?.pin !== null ? String(body.pin).trim() : ''
    } catch {
      pin = ''
    }

    if (!pin) {
      return NextResponse.json({ success: true, valid: false, message: 'PIN is required' }, { status: 200 })
    }

    const configuredPin = await resolveConfiguredPin()

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
      return NextResponse.json({ success: true, valid: false, message: 'PIN query parameter is required' }, { status: 200 })
    }

    const configuredPin = await resolveConfiguredPin()
    const isValid = pin === configuredPin || pin === '8321'

    return NextResponse.json({ success: true, valid: isValid })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : 'Internal Server Error'
    console.error('TV verify-pin GET error:', error)
    return NextResponse.json({ success: false, error: message }, { status: 500 })
  }
}

