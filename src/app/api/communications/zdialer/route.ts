import { NextResponse } from 'next/server'
import { checkAccountOwnership } from '@/lib/auth-helpers'
import { prisma } from '@/lib/prisma'
import { guardSmsSend } from '@/lib/sms-suppression'
import { zdialerNumber } from '@/lib/zdialer'

// Database-only handoff preflight. Never submits a message or starts a sync.
export async function POST(request: Request) {
  try {
    const origin = request.headers.get('origin')
    if (origin && origin !== new URL(request.url).origin) return NextResponse.json({ error: 'Origin not allowed' }, { status: 403 })
    const body = await request.json()
    if (body.accountId != null && typeof body.accountId !== 'string') return NextResponse.json({ error: 'Invalid account' }, { status: 400 })
    if (body.contactId != null && typeof body.contactId !== 'string') return NextResponse.json({ error: 'Invalid contact' }, { status: 400 })
    const access = await checkAccountOwnership(body.accountId || undefined)
    if (!access.authorized) return access.errorResponse || NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    let phone = typeof body.phone === 'string' ? body.phone : ''
    if (body.accountId) {
      const account = await prisma.account.findFirst({ where: { OR: [{ id: body.accountId }, { zohoId: body.accountId }] }, select: { contacts: { select: { id: true, isPrimary: true, phone: true, mobilePhone: true } } } })
      if (!account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })
      const contact = body.contactId ? account.contacts.find(item => item.id === body.contactId) : account.contacts.find(item => item.isPrimary) || account.contacts[0]
      if (body.contactId && !contact) return NextResponse.json({ error: 'Contact does not belong to this account' }, { status: 400 })
      if (!phone) phone = contact?.mobilePhone || contact?.phone || ''
    }
    const normalized = zdialerNumber(phone)
    if (!normalized.startsWith('+')) return NextResponse.json({ error: 'A full recipient phone number with country code is required for SMS.' }, { status: 400 })
    const decision = await guardSmsSend({ phone: normalized, traffic: 'TRANSACTIONAL' })
    if (!decision.allowed) return NextResponse.json({ error: `SMS blocked: ${decision.reason}` }, { status: 409 })
    return NextResponse.json({ success: true, phone: normalized, sent: false }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'Unable to verify this SMS recipient. Nothing was sent.' }, { status: 500 })
  }
}
