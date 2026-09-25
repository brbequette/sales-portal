import { NextRequest, NextResponse } from 'next/server'
import { parseTelegramUpdate, validSecret } from '@/lib/telegram-policy'
import { bindTelegram, enqueueTelegram, telegramEnabled } from '@/lib/telegram-service'

export async function POST(req: NextRequest) {
  if (!telegramEnabled()) return NextResponse.json({ error: 'Disabled' }, { status: 503 })
  if (!validSecret(req.headers.get('x-telegram-bot-api-secret-token'), process.env.TELEGRAM_WEBHOOK_SECRET)) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (Number(req.headers.get('content-length') || 0) > 16000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  const raw = await req.text()
  if (raw.length > 16000) return NextResponse.json({ error: 'Too large' }, { status: 413 })
  let body: unknown
  try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 }) }
  const update = parseTelegramUpdate(body)
  if (!update) return NextResponse.json({ ok: true })
  const pair = update.text.match(/^\/start ([\w-]{32})$/)
  if (pair) { await bindTelegram(pair[1], update.telegramId, update.chatId); update.text = '/start' }
  await enqueueTelegram(update)
  return NextResponse.json({ ok: true })
}
