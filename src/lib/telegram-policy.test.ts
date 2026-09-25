import { describe, expect, it } from 'vitest'
import { accountScope, agentAllowed, pairKey, parseTelegramUpdate, telegramEligible, validSecret } from './telegram-policy'

describe('Telegram identity and authorization boundaries', () => {
  it('requires the exact configured webhook secret and fails closed when unset', () => {
    expect(validSecret('x'.repeat(32), 'x'.repeat(32))).toBe(true)
    expect(validSecret('y'.repeat(32), 'x'.repeat(32))).toBe(false)
    expect(validSecret('', undefined)).toBe(false)
    expect(validSecret('short', 'short')).toBe(false)
  })
  it('only accepts private messages from the exact chat owner, not forwarded identity claims or groups', () => {
    const message = { text: 'hello', from: { id: 123 }, chat: { id: 123, type: 'private' } }
    expect(parseTelegramUpdate({ update_id: 7, message })?.telegramId).toBe('123')
    expect(parseTelegramUpdate({ update_id: 7, message: { ...message, chat: { id: 456, type: 'private' } } })).toBeNull()
    expect(parseTelegramUpdate({ update_id: 7, message: { ...message, chat: { id: 123, type: 'group' } } })).toBeNull()
    expect(parseTelegramUpdate({ update_id: 7, message: { ...message, from: { id: 123, is_bot: true } } })).toBeNull()
    expect(parseTelegramUpdate(null)).toBeNull()
  })
  it('keeps reps restricted to their own records and accounting restricted to management', () => {
    expect(accountScope({ id: 'rep-a', role: 'AGENT' })).toEqual({ ownerId: 'rep-a' })
    expect(accountScope({ id: 'boss', role: 'ADMIN' })).toEqual({})
    expect(agentAllowed('accounting', 'AGENT')).toBe(false)
    expect(agentAllowed('accounting', 'MANAGER')).toBe(true)
    expect(agentAllowed('accounting', 'COLLECTIONS')).toBe(false)
    expect(agentAllowed('products', 'AGENT')).toBe(true)
  })
  it('blocks disabled credentials and stores only a hash of the pairing code', () => {
    expect(telegramEligible({ role: 'VIEWER' })).toBe(false)
    expect(telegramEligible({ role: 'AGENT', mustRotatePassword: true })).toBe(false)
    expect(telegramEligible({ role: 'ADMIN', lockedUntil: new Date(Date.now() + 10000) })).toBe(false)
    expect(pairKey('secret-pair-code')).not.toContain('secret-pair-code')
  })
})
