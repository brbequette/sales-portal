import { NextResponse } from 'next/server'
import { requireAdministrator } from '@/lib/auth-helpers'
import { refreshTargetedInvoice } from '@/lib/targeted-invoice-refresh'

export const dynamic = 'force-dynamic'
export async function POST(request: Request) {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const actorId = auth.session?.user.dbId
  if (!actorId) return NextResponse.json({ error: 'ADMIN_IDENTITY_REQUIRED' }, { status: 403 })
  try {
    const body = await request.json()
    if (typeof body.booksInvoiceId !== 'string' || typeof body.expectedUpdatedAt !== 'string') return NextResponse.json({ error: 'INVALID_REFRESH_REQUEST' }, { status: 400 })
    const result = await refreshTargetedInvoice(body.booksInvoiceId, body.expectedUpdatedAt, actorId)
    return NextResponse.json(result)
  } catch (error) {
    const code = error instanceof Error && /^[A-Z_0-9]+$/.test(error.message) ? error.message : 'REFRESH_REQUIRES_REVIEW'
    return NextResponse.json({ error: code }, { status: 409 })
  }
}
