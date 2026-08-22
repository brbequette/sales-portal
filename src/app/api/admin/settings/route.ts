import { NextResponse } from 'next/server'
import { getSystemSettings, updateSystemSettings } from '@/lib/settings'
import { requireAdministrator } from '@/lib/auth-helpers'

export async function GET() {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const settings = await getSystemSettings()
    
    return NextResponse.json({ 
      success: true, 
      settings
    })
  } catch (error: any) {
    console.error('Fetch Settings Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}

export async function PUT(req: Request) {
  try {
    const auth = await requireAdministrator()
    if (auth.errorResponse) return auth.errorResponse
    const body = await req.json()
    await updateSystemSettings(body)
    return NextResponse.json({ success: true })
  } catch (error: any) {
    console.error('Save Settings Error:', error)
    return NextResponse.json({ success: false, error: error.message }, { status: 500 })
  }
}
