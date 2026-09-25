import { randomBytes } from 'node:crypto'
import { prisma } from './prisma'
import { answerTelegram } from './telegram-agent'
import { approveTelegramAction, reviewTelegramAction, setTelegramAuto } from './telegram-actions'
import { agentAllowed, telegramAgents, bindingKey, pairKey, portalKey, telegramEligible, type TelegramBinding } from './telegram-policy'

export const telegramEnabled = () => process.env.TELEGRAM_ENABLED === 'true' && Boolean(process.env.TELEGRAM_BOT_TOKEN) && /^[A-Za-z0-9_]{2,29}bot$/i.test(process.env.TELEGRAM_BOT_USERNAME || '') && (process.env.TELEGRAM_WEBHOOK_SECRET?.length || 0) >= 32 && (process.env.TELEGRAM_WORKER_SECRET?.length || 0) >= 32 && /^https:\/\/[^/]+$/.test(process.env.TELEGRAM_PUBLIC_ORIGIN || '')
export async function makePairCode(userId: string) {
  const code = randomBytes(24).toString('base64url'), expiresAt = Date.now() + 10 * 60000
  // One active pairing request per portal user, invalidated on disconnect.
  await prisma.systemSetting.upsert({ where: { key: `telegram:pending:${userId}` }, create: { key: `telegram:pending:${userId}`, value: pairKey(code) }, update: { value: pairKey(code) } })
  await prisma.systemSetting.create({ data: { key: pairKey(code), value: JSON.stringify({ userId, expiresAt }) } })
  return { expiresAt, url: `https://t.me/${process.env.TELEGRAM_BOT_USERNAME}?start=${code}` }
}
export async function bindTelegram(code: string, telegramId: string, chatId: string) {
  if (!/^[\w-]{32}$/.test(code)) return false
  return prisma.$transaction(async tx => {
    const pair = await tx.systemSetting.findUnique({ where: { key: pairKey(code) } })
    if (!pair) return false
    const data = JSON.parse(pair.value) as { userId: string; expiresAt: number }
    const [pending, user] = await Promise.all([tx.systemSetting.findUnique({ where: { key: `telegram:pending:${data.userId}` } }), tx.user.findUnique({ where: { id: data.userId } })])
    if (data.expiresAt < Date.now() || pending?.value !== pair.key || !user || !telegramEligible(user)) return false
    if (await tx.systemSetting.findFirst({ where: { key: { in: [bindingKey(telegramId), portalKey(data.userId)] } } })) return false
    const consumed = await tx.systemSetting.deleteMany({ where: { key: pair.key, value: pair.value } })
    if (consumed.count !== 1) return false
    await tx.systemSetting.deleteMany({ where: { key: pending.key, value: pending.value } })
    const binding: TelegramBinding = { userId: user.id, telegramId, chatId, nonce: randomBytes(16).toString('hex'), agent: 'sales' }
    await tx.systemSetting.create({ data: { key: bindingKey(telegramId), value: JSON.stringify(binding) } })
    await tx.systemSetting.create({ data: { key: portalKey(user.id), value: telegramId } })
    return true
  })
}
export async function disconnectTelegram(userId: string) {
  await prisma.$transaction(async tx => {
    const row = await tx.systemSetting.findUnique({ where: { key: portalKey(userId) } })
    if (row) {
      const binding = await tx.systemSetting.findUnique({ where: { key: bindingKey(row.value) } })
      if (binding && JSON.parse(binding.value).userId === userId) await tx.systemSetting.deleteMany({ where: { key: binding.key, value: binding.value } })
      await tx.systemSetting.deleteMany({ where: { key: row.key, value: row.value } })
    }
    await tx.systemSetting.deleteMany({ where: { key: `telegram:pending:${userId}` } })
  })
}
export async function getBinding(telegramId: string) {
  const row = await prisma.systemSetting.findUnique({ where: { key: bindingKey(telegramId) } })
  return row ? JSON.parse(row.value) as TelegramBinding : null
}
export async function enqueueTelegram(update: { updateId: number; telegramId: string; chatId: string; text: string }) {
  const binding = await getBinding(update.telegramId)
  if (!binding || binding.chatId !== update.chatId) return
  const user = await prisma.user.findUnique({ where: { id: binding.userId } })
  if (!user || !telegramEligible(user)) return
  const recent = await prisma.operationalAction.count({ where: { actionType: 'TELEGRAM_AGENT_REPLY', actorId: user.id, createdAt: { gt: new Date(Date.now() - 60000) } } })
  if (recent >= 6) return
  // createMany skipDuplicates makes webhook retries harmless without changing an existing job.
  await prisma.operationalAction.createMany({ data: [{ idempotencyKey: `telegram-update:${update.updateId}`, actionType: 'TELEGRAM_AGENT_REPLY', entityType: 'TELEGRAM_CHAT', entityId: binding.chatId, actorId: user.id, maxAttempts: 1, payload: { ...update, nonce: binding.nonce }, status: 'PENDING' }], skipDuplicates: true })
}
async function sendTelegram(chatId: string, text: string) {
  // Plain text only, no parse_mode, attachments, arbitrary recipients, or automatic resend.
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendMessage`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ chat_id: chatId, text: text.slice(0, 3500), protect_content: true, link_preview_options: { is_disabled: true } }), signal: AbortSignal.timeout(15000) })
  const result = await response.json()
  if (!response.ok || result.ok !== true) throw new Error('TELEGRAM_DELIVERY_UNCONFIRMED')
  return result.result?.message_id as number | undefined
}
async function sendFlyer(chatId: string, svg: string) {
  const form = new FormData()
  form.set('chat_id', chatId); form.set('protect_content', 'true')
  form.set('document', new Blob([svg], { type: 'image/svg+xml' }), 'titan-product-flyer.svg')
  const response = await fetch(`https://api.telegram.org/bot${process.env.TELEGRAM_BOT_TOKEN}/sendDocument`, { method: 'POST', body: form, signal: AbortSignal.timeout(20000) })
  const result = await response.json()
  if (!response.ok || result.ok !== true) throw new Error('TELEGRAM_ARTIFACT_DELIVERY_UNCONFIRMED')
}
export async function processTelegramJob(id: string) {
  if (!telegramEnabled()) return
  const claim = await prisma.operationalAction.updateMany({ where: { id, actionType: 'TELEGRAM_AGENT_REPLY', status: 'PENDING' }, data: { status: 'RUNNING', startedAt: new Date(), attemptCount: { increment: 1 } } })
  if (!claim.count) return
  try {
    const job = await prisma.operationalAction.findUniqueOrThrow({ where: { id } })
    const payload = job.payload as { telegramId: string; chatId: string; text: string; nonce: string }
    if (Date.now() - job.createdAt.getTime() > 3600000) throw new Error('TELEGRAM_JOB_EXPIRED')
    const binding = await getBinding(payload.telegramId)
    if (!binding || binding.userId !== job.actorId || binding.chatId !== payload.chatId || binding.nonce !== payload.nonce) throw new Error('TELEGRAM_LINK_REVOKED')
    const user = await prisma.user.findUnique({ where: { id: binding.userId } })
    if (!user || !telegramEligible(user)) throw new Error('TELEGRAM_ACCESS_REVOKED')
    let answer: string, svg: string | undefined
    const command = payload.text.toLowerCase()
    const approve = payload.text.match(/^\/approve ([\w-]{1,80})$/), review = payload.text.match(/^\/review ([\w-]{1,80}) (correct|incorrect)$/), cancel = payload.text.match(/^\/cancel ([\w-]{1,80})$/), auto = payload.text.match(/^\/auto create_task (on|off)$/)
    if (approve) { const result = await approveTelegramAction(binding, approve[1]); answer = result.message; svg = result.svg }
    else if (review) answer = await reviewTelegramAction(binding, review[1], review[2] === 'correct')
    else if (cancel) { const result = await prisma.operationalAction.updateMany({ where: { id: cancel[1], actorId: user.id, status: 'AWAITING_APPROVAL', actionType: { startsWith: 'TELEGRAM_ACTION_' } }, data: { status: 'CANCELLED', completedAt: new Date() } }); answer = result.count ? 'Proposed action cancelled.' : 'No pending action found for your account.' }
    else if (auto) answer = await setTelegramAuto(binding, auto[1] === 'on')
    else if (['/start', '/help'].includes(command)) answer = `Connected to Titan. Choose ${telegramAgents.filter(a => agentAllowed(a, user.role)).map(a => '/' + a).join(', ')}, then include the company or product name in your question. I can propose portal task creation/completion and SVG flyer rendering. Review the exact proposal and use /approve ACTION_ID or /cancel ACTION_ID. Review verified outcomes with /review ACTION_ID correct|incorrect. Management may enable eligible task creation with /auto create_task on. Financial changes and customer sends are not enabled. Disconnect from the portal Telegram page.`
    else if (telegramAgents.some(a => command === '/' + a)) {
      binding.agent = command.slice(1) as TelegramBinding['agent']
      if (!agentAllowed(binding.agent, user.role)) throw new Error('TELEGRAM_AGENT_NOT_ALLOWED')
      // Preserve a concurrent disconnect/re-pair instead of recreating a deleted link.
      const old = await prisma.systemSetting.findUnique({ where: { key: bindingKey(payload.telegramId) } })
      if (!old || JSON.parse(old.value).nonce !== payload.nonce) throw new Error('TELEGRAM_LINK_REVOKED')
      await prisma.systemSetting.updateMany({ where: { key: old.key, value: old.value }, data: { value: JSON.stringify(binding) } })
      answer = `Selected ${binding.agent}. Include an account name and what you want to know. Each question is evaluated against your current portal access.`
    } else answer = await answerTelegram(binding.userId, binding.agent, payload.text, binding, job.id)
    // Recheck both pairing and role immediately before delivering any account data.
    const [latest, latestUser] = await Promise.all([getBinding(payload.telegramId), prisma.user.findUnique({ where: { id: binding.userId } })])
    if (!telegramEnabled() || latest?.nonce !== binding.nonce || !latestUser || !telegramEligible(latestUser) || latestUser.role !== user.role) throw new Error('TELEGRAM_ACCESS_CHANGED')
    const messageId = await sendTelegram(binding.chatId, answer)
    if (svg) await sendFlyer(binding.chatId, svg)
    await prisma.operationalAction.update({ where: { id }, data: { status: 'SUCCEEDED', completedAt: new Date(), result: { agent: binding.agent, telegramMessageId: messageId || null } } })
  } catch {
    // Network outcomes may be ambiguous. Never automatically re-send a customer-data reply.
    await prisma.operationalAction.update({ where: { id }, data: { status: 'FAILED', completedAt: new Date(), errorCode: 'TELEGRAM_REPLY_FAILED', errorMessage: 'Reply failed or delivery is unconfirmed. Inspect the job before any manual retry.' } })
  }
}
