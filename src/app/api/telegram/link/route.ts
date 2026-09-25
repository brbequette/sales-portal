import { NextRequest, NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { disconnectTelegram, makePairCode, telegramEnabled } from '@/lib/telegram-service'
import { portalKey, telegramEligible } from '@/lib/telegram-policy'

async function currentUser() {
  const session = await getServerSession(authOptions)
  if (!session?.user?.email) return null
  const user = await prisma.user.findUnique({ where: { email: session.user.email } })
  return user && telegramEligible(user) ? user : null
}
export async function GET() {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in with an eligible portal account.' }, { status: 401 })
  const link = await prisma.systemSetting.findUnique({ where: { key: portalKey(user.id) } })
  return NextResponse.json({ enabled: telegramEnabled(), linked: Boolean(link), username: process.env.TELEGRAM_BOT_USERNAME || null }, { headers: { 'Cache-Control': 'no-store' } })
}
export async function POST(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin mismatch' }, { status: 403 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  if (!telegramEnabled()) return NextResponse.json({ error: 'Telegram is not configured yet.' }, { status: 503 })
  if (await prisma.systemSetting.findUnique({ where: { key: portalKey(user.id) } })) return NextResponse.json({ error: 'Disconnect your current Telegram link first.' }, { status: 409 })
  return NextResponse.json(await makePairCode(user.id), { headers: { 'Cache-Control': 'no-store' } })
}
export async function DELETE(req: NextRequest) {
  if (req.headers.get('origin') !== req.nextUrl.origin) return NextResponse.json({ error: 'Origin mismatch' }, { status: 403 })
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: 'Sign in required.' }, { status: 401 })
  await disconnectTelegram(user.id)
  return NextResponse.json({ success: true })
}
