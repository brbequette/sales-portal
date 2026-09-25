import type { Handler } from '@netlify/functions'
import { prisma } from '../../src/lib/prisma'
import { telegramEnabled } from '../../src/lib/telegram-service'

export const handler: Handler = async () => {
  if (!telegramEnabled()) return { statusCode: 200 }
  const origin = process.env.TELEGRAM_PUBLIC_ORIGIN
  if (!origin || !/^https:\/\/[^/]+$/.test(origin)) return { statusCode: 503 }
  const jobs = await prisma.operationalAction.findMany({ where: { actionType: 'TELEGRAM_AGENT_REPLY', status: 'PENDING' }, orderBy: { createdAt: 'asc' }, take: 10, select: { id: true, entityId: true } })
  const chats = new Set<string>()
  for (const job of jobs) {
    if (chats.has(job.entityId)) continue
    chats.add(job.entityId)
    const running = await prisma.operationalAction.count({ where: { actionType: 'TELEGRAM_AGENT_REPLY', entityId: job.entityId, status: 'RUNNING' } })
    if (running) continue
    await fetch(`${origin}/.netlify/functions/telegram-agent-background`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-titan-worker-secret': process.env.TELEGRAM_WORKER_SECRET! }, body: JSON.stringify({ id: job.id }), signal: AbortSignal.timeout(5000) })
  }
  return { statusCode: 200 }
}
