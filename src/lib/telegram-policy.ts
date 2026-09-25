import { createHash, timingSafeEqual } from 'node:crypto'
import { normalizeAiRole } from './ai-action-policy'

export type TelegramAgent = 'accounting' | 'graphics' | 'operations' | 'collections' | 'sales' | 'products'
export const telegramAgents: TelegramAgent[] = ['accounting', 'graphics', 'operations', 'collections', 'sales', 'products']
export function agentAllowed(agent: TelegramAgent, role: string) {
  return telegramAgents.includes(agent) && (agent !== 'accounting' || ['master_admin', 'admin', 'administrator', 'manager'].includes(role.trim().toLowerCase()))
}
export type TelegramBinding = { userId: string; telegramId: string; chatId: string; nonce: string; agent: TelegramAgent }
export const pairKey = (code: string) => `telegram:pair:${createHash('sha256').update(code).digest('hex')}`
export const bindingKey = (id: string) => `telegram:user:${id}`
export const portalKey = (id: string) => `telegram:portal:${id}`
export function validSecret(actual: string | null | undefined, expected: string | undefined) {
  if (!actual || !expected || expected.length < 32) return false
  const a = Buffer.from(actual), b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}
export function accountScope(user: { id: string; role: string }) {
  return ['ADMIN', 'MANAGER'].includes(normalizeAiRole(user.role)) ? {} : { ownerId: user.id }
}
export function telegramEligible(user: { role: string; lockedUntil?: Date | null; mustRotatePassword?: boolean }) {
  return normalizeAiRole(user.role) !== 'VIEWER' && !user.mustRotatePassword && !(user.lockedUntil && user.lockedUntil > new Date())
}
export function parseTelegramUpdate(value: unknown): { updateId: number; telegramId: string; chatId: string; text: string } | null {
  const v = value as { update_id?: number; message?: { text?: string; from?: { id?: number; is_bot?: boolean }; chat?: { id?: number; type?: string } } }
  const m = v?.message
  if (!Number.isSafeInteger(v?.update_id) || !m || m.chat?.type !== 'private' || m.from?.is_bot || !Number.isSafeInteger(m.from?.id) || m.chat?.id !== m.from?.id || typeof m.text !== 'string' || !m.text.trim()) return null
  return { updateId: v.update_id!, telegramId: String(m.from!.id), chatId: String(m.chat!.id), text: m.text.trim().slice(0, 4000) }
}
