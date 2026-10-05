import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '../../../../../netlify/functions/lib/auth-middleware'
import { requireVoiceSender } from '../../../../../netlify/functions/lib/voice-directory'
import { checkAccountOwnership } from '@/lib/auth-helpers'
// Preflight only. Media and call status belong to the authenticated Zoho WebSDK.
export async function POST(req: NextRequest) {
  try {
    const caller = await authenticateRequest(req)
    if (req.headers.get('origin') && req.headers.get('origin') !== new URL(req.url).origin) return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
    const { toNumber, fromNumber, accountId } = await req.json()
    if (typeof toNumber !== 'string' || !/^\+?[0-9]{3,15}$/.test(toNumber)) return NextResponse.json({ error: 'Invalid destination number' }, { status: 400 })
    if (accountId) { const access = await checkAccountOwnership(accountId); if (!access.authorized) return access.errorResponse }
    const number = await requireVoiceSender(caller, fromNumber)
    return NextResponse.json({ success: true, placed: false, number: number.number, numberId: number.numberId, toNumber })
  } catch (e) { return NextResponse.json({ error: e instanceof Error ? e.message : 'Call preflight failed' }, { status: 403 }) }
}
