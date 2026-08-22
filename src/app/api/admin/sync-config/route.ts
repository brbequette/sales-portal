import { NextRequest, NextResponse } from 'next/server'
import { getSyncConfig, saveSyncConfig } from '@/lib/sync-config'
import { requireAdministrator } from '@/lib/auth-helpers'

/** GET /api/admin/sync-config — returns current sync settings */
export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const config = await getSyncConfig()
    return NextResponse.json({ success: true, config })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}

/** PUT /api/admin/sync-config — saves updated sync settings */
export async function PUT(req: NextRequest) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse

  try {
    const body = await req.json()
    await saveSyncConfig(body.config)
    return NextResponse.json({ success: true })
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 })
  }
}
