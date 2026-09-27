import { describe, expect, it } from 'vitest'
import { existsSync } from 'node:fs'
import { recentSystemRequests, searchSystemKnowledge, systemTopics } from '../src/lib/telegram-system'
import type { TelegramBinding } from '../src/lib/telegram-policy'

describe('system knowledge retrieval', () => {
  it.each([
    ['where do I work leads and calling', '/sales/leads-calling'],
    ['invoices billing', '/docs'],
    ['zoho integrations sync', '/admin/data-integrations'],
    ['shipping easyship', '/shipping'],
    ['telegram bot slow reply', '/telegram'],
    ['system health configuration status', '/admin/system-health'],
  ])('retrieves a grounded screen for %s', (question, path) => {
    const result = searchSystemKnowledge(question, 'ADMIN')
    expect(result.matches.some(item => item.url === `https://www.tdusales.com${path}`)).toBe(true)
  })
  it('does not return management screens to reps', () => {
    expect(searchSystemKnowledge('zoho integrations health campaign admin', 'AGENT').matches.every(item => !item.url.includes('/admin/'))).toBe(true)
  })
  it('supports broad system questions and does not fabricate unknown topics', () => {
    expect(searchSystemKnowledge('tell me anything about the system', 'ADMIN').matches[0].title).toBe('System overview')
    expect(searchSystemKnowledge('zyxnonexistentfeature', 'ADMIN').matches).toEqual([])
  })
  it('links only to actual portal screens', () => {
    for (const topic of systemTopics) expect(existsSync(`src/app${topic.path}/page.tsx`), topic.path).toBe(true)
  })
})

describe('bounded recent user-request context', () => {
  const binding: TelegramBinding = { userId: 'u', telegramId: '1', chatId: '1', nonce: 'current', agent: 'system' }
  const row = (text: string) => ({ payload: { ...binding, text }, result: { agent: 'system', portalRole: 'ADMIN', answer: 'Do not reuse this private assistant answer.' } })
  it('keeps chronological user context without old answers or commands', () => {
    const context = recentSystemRequests([row('What about its balance?'), row('/directions'), row('Review Example Company')], binding, 'ADMIN')
    expect(context).toEqual(['Review Example Company', 'What about its balance?'])
    expect(JSON.stringify(context)).not.toContain('private assistant answer')
  })
  it('excludes different pairing, chat, role, and unversioned results', () => {
    const a = row('old pair'); a.payload.nonce = 'old'
    const b = row('other chat'); b.payload.chatId = '2'
    const c = row('changed role'); c.result.portalRole = 'AGENT'
    const d = row('other agent'); d.result.agent = 'accounting'
    expect(recentSystemRequests([a, b, c, d, { payload: binding, result: null }], binding, 'ADMIN')).toEqual([])
  })
  it('stops at a successful reset and bounds user text', () => {
    expect(recentSystemRequests([row('new'), row('/reset'), row('old')], binding, 'ADMIN')).toEqual(['new'])
    expect(recentSystemRequests([row('a'.repeat(4000))], binding, 'ADMIN')[0]).toHaveLength(1500)
  })
})
