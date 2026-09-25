// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'

const mocks = vi.hoisted(() => ({
  findMany: vi.fn(), count: vi.fn(), processJob: vi.fn(),
}))
vi.mock('../src/lib/prisma', () => ({ prisma: { operationalAction: { findMany: mocks.findMany, count: mocks.count } } }))
vi.mock('../src/lib/telegram-service', () => ({ telegramEnabled: () => true, processTelegramJob: mocks.processJob }))
import { proxy } from '../src/proxy'
import { handler as dispatch } from '../netlify/functions/telegram-agent-dispatch'
import { handler as background } from '../netlify/functions/telegram-agent-background'

const worker = '/.netlify/functions/telegram-agent-background'
const secret = 'a'.repeat(48)
const invoke = (handler: typeof background, event: object = {}) => handler(event as never, {} as never, vi.fn())

beforeEach(() => {
  vi.restoreAllMocks()
  vi.clearAllMocks()
  process.env.TELEGRAM_PUBLIC_ORIGIN = 'https://portal.example.com'
  process.env.TELEGRAM_WORKER_SECRET = secret
  mocks.findMany.mockResolvedValue([{ id: 'job-1', entityId: 'chat-1' }])
  mocks.count.mockResolvedValue(0)
})

describe('worker routing and authentication', () => {
  it('lets the exact native worker reach its secret authentication without a session', async () => {
    const response = await proxy(new NextRequest(`https://portal.example.com${worker}`))
    expect(response.headers.get('x-middleware-next')).toBe('1')
    expect(response.headers.get('location')).toBeNull()
  })
  it.each([`${worker}-other`, `${worker}/child`, '/.netlify/functions/other-worker', '/telegram'])('retains session protection for %s', async path => {
    const response = await proxy(new NextRequest(`https://portal.example.com${path}`))
    expect(response.status).toBe(307)
    expect(new URL(response.headers.get('location')!).pathname).toBe('/employee-login')
  })
  it.each([undefined, 'wrong-secret'])('rejects an unauthorized invocation', async supplied => {
    expect(await invoke(background, { httpMethod: 'POST', headers: { 'x-titan-worker-secret': supplied }, body: '{"id":"job-1"}' })).toEqual({ statusCode: 401 })
    expect(mocks.processJob).not.toHaveBeenCalled()
  })
  it('processes an authenticated job', async () => {
    expect(await invoke(background, { httpMethod: 'POST', headers: { 'x-titan-worker-secret': secret }, body: '{"id":"job-1"}' })).toEqual({ statusCode: 200 })
    expect(mocks.processJob).toHaveBeenCalledWith('job-1')
  })
})

describe('dispatch acknowledgement', () => {
  it('requires a background acknowledgement and refuses redirects', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status: 202 }))
    expect(await invoke(dispatch)).toEqual({ statusCode: 200 })
    expect(fetchMock).toHaveBeenCalledWith(`https://portal.example.com${worker}`, expect.objectContaining({ method: 'POST', redirect: 'error', body: '{"id":"job-1"}' }))
  })
  it.each([200, 307, 401, 500])('does not accept HTTP %s as a dispatched job', async status => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(null, { status }))
    await expect(invoke(dispatch)).rejects.toThrow(`Telegram worker dispatch rejected (${status})`)
  })
})
