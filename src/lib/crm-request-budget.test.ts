// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest'
vi.mock('./prisma', () => ({ prisma: { $transaction: vi.fn() } }))
import { prisma } from './prisma'
import { completeCrmBudget, crmBudgetFetch, initialCrmBudget, isZohoCrmRequest, parseCrmBudget, reserveCrmBudget } from './crm-request-budget'

const now = new Date('2026-09-27T02:00:00Z')
const enforce = () => ({ ...initialCrmBudget(now), mode: 'enforce' as const, baselineVerified: true, expiresAt: '2026-09-28T02:00:00Z' })
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); vi.clearAllMocks() })

describe('CRM allowance reservations', () => {
  it('requires a verified baseline and explicit expiry', () => {
    expect(() => reserveCrmBudget({ ...enforce(), baselineVerified: false }, 'a', now)).toThrow('BASELINE_REQUIRED')
    expect(() => reserveCrmBudget({ ...enforce(), expiresAt: null }, 'a', now)).toThrow('BASELINE_REQUIRED')
  })
  it('does not reset an expired allowance', () => {
    expect(() => reserveCrmBudget(enforce(), 'a', new Date('2026-09-29'))).toThrow('ALLOWANCE_EXPIRED')
  })
  it('counts the last available request and never refunds it', () => {
    const reserved = reserveCrmBudget({ ...enforce(), baselineRequests: 49999 }, 'a', now)
    const done = completeCrmBudget(reserved, 'a', { status: 500 }, now)
    expect(done.reserved).toBe(1)
    expect(() => reserveCrmBudget(done, 'b', now)).toThrow('LIMIT')
    expect(completeCrmBudget(done, 'a', { status: 200 }, now)).toEqual(done)
  })
  it('blocks duplicate claims and concurrent requests', () => {
    const reserved = reserveCrmBudget(enforce(), 'a', now)
    expect(() => reserveCrmBudget(reserved, 'a', now)).toThrow('DUPLICATE_RESERVATION')
    expect(() => reserveCrmBudget(reserved, 'b', now)).toThrow('CONCURRENCY')
  })
  it.each([{}, { status: 401 }, { status: 403 }, { status: 200, remainingCredits: 0 }])('halts after an unsafe outcome %j', outcome => {
    const done = completeCrmBudget(reserveCrmBudget(enforce(), 'a', now), 'a', outcome, now)
    expect(() => reserveCrmBudget(done, 'b', now)).toThrow('HALTED')
    expect(done.reserved).toBe(done.responses + done.uncertain)
  })
  it('honors rate-limit cooldown without resetting counts', () => {
    const done = completeCrmBudget(reserveCrmBudget(enforce(), 'a', now), 'a', { status: 429, retryAfterSeconds: 120 }, now)
    expect(() => reserveCrmBudget(done, 'b', new Date(now.getTime() + 119000))).toThrow('COOLDOWN')
    expect(reserveCrmBudget(done, 'b', new Date(now.getTime() + 120000)).reserved).toBe(2)
  })
  it('records observation without claiming an enforced baseline', () => {
    const s = reserveCrmBudget(initialCrmBudget(now), 'a', now)
    expect(s.baselineVerified).toBe(false)
    expect(s.mode).toBe('observe')
    expect(parseCrmBudget(JSON.stringify(s))).toEqual(s)
  })
  it.each([{ reserved: 1 }, { limit: 50001 }, { pending: [] }, { baselineRequests: Number.MAX_SAFE_INTEGER, reserved: 1, responses: 1 }])('rejects invalid persisted state %j', patch => {
    expect(() => parseCrmBudget(JSON.stringify({ ...enforce(), ...patch }))).toThrow('INVALID_STATE')
  })
})

describe('CRM transport activation', () => {
  function ledger() {
    let persisted: ReturnType<typeof initialCrmBudget> = enforce()
    vi.stubEnv('ZOHO_CRM_REQUEST_ACCOUNTING', 'on')
    vi.mocked(prisma.$transaction).mockImplementation((async (callback: (tx: unknown) => Promise<unknown>) => callback({
      $executeRaw: async () => 1,
      systemSetting: { update: async ({ data }: { data: { value: string } }) => { persisted = parseCrmBudget(data.value) } },
      $queryRaw: async () => [{ value: JSON.stringify(persisted), now }],
    })) as never)
    return () => persisted
  }
  it('counts one response and preserves its body, status and headers', async () => {
    const read = ledger()
    const fetch = vi.fn().mockResolvedValue(new Response('{"data":[]}', { status: 200, headers: { 'x-api-credits-remaining': '123' } }))
    vi.stubGlobal('fetch', fetch)
    const response = await crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')
    expect(await response.json()).toEqual({ data: [] })
    expect(response.headers.get('x-api-credits-remaining')).toBe('123')
    expect(read()).toMatchObject({ reserved: 1, responses: 1, uncertain: 0, pending: {}, remainingCredits: 123 })
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(fetch.mock.calls[0][1].redirect).toBe('error')
  })
  it('preserves a no-content response', async () => {
    ledger(); vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response(null, { status: 204 })))
    const response = await crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')
    expect(response.status).toBe(204); expect(await response.text()).toBe('')
  })
  it('records uncertainty and never retries a network failure', async () => {
    const read = ledger(); const fetch = vi.fn().mockRejectedValue(new Error('network failure')); vi.stubGlobal('fetch', fetch)
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).rejects.toThrow('network failure')
    expect(read()).toMatchObject({ reserved: 1, uncertain: 1, responses: 0, haltReason: 'UNCERTAIN_REQUEST' })
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).rejects.toThrow('HALTED')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('does not classify an accepted but unrecorded result as an unsent request', async () => {
    ledger()
    const normal = vi.mocked(prisma.$transaction).getMockImplementation()!
    vi.mocked(prisma.$transaction).mockImplementationOnce(normal).mockRejectedValueOnce(new Error('database down'))
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch)
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).rejects.toThrow('CRM_BUDGET_RESULT_UNRECORDED')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('treats a truncated successful response as uncertainty without retry', async () => {
    const read = ledger()
    const stream = new ReadableStream({ start(controller) { controller.enqueue(new Uint8Array([123])); controller.error(new Error('body truncated')) } })
    const fetch = vi.fn().mockResolvedValue(new Response(stream, { status: 200 }))
    vi.stubGlobal('fetch', fetch)
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals', { method: 'POST', body: '{}' })).rejects.toThrow('body truncated')
    expect(read()).toMatchObject({ reserved: 1, responses: 0, uncertain: 1, haltReason: 'UNCERTAIN_REQUEST' })
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('keeps an unresolved reservation when uncertainty cannot be recorded', async () => {
    const read = ledger()
    const normal = vi.mocked(prisma.$transaction).getMockImplementation()!
    vi.mocked(prisma.$transaction).mockImplementationOnce(normal).mockRejectedValueOnce(new Error('database down'))
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('transport lost')))
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).rejects.toThrow('UNCERTAIN_RESULT_UNRECORDED')
    expect(read().reserved).toBe(1)
    expect(Object.keys(read().pending)).toHaveLength(1)
  })
  it('preserves provider 429 and blocks the next request for its retry-after period', async () => {
    const read = ledger()
    const fetch = vi.fn().mockResolvedValue(new Response('{}', { status: 429, headers: { 'retry-after': '120' } }))
    vi.stubGlobal('fetch', fetch)
    expect((await crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).status).toBe(429)
    expect(read().notBefore).toBe('2026-09-27T02:02:00.000Z')
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).rejects.toThrow('COOLDOWN')
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('passes Books requests through without reserving CRM allowance', async () => {
    ledger(); vi.mocked(prisma.$transaction).mockClear()
    const fetch = vi.fn().mockResolvedValue(new Response('{}')); vi.stubGlobal('fetch', fetch)
    await crmBudgetFetch('https://www.zohoapis.com/books/v3/invoices')
    expect(prisma.$transaction).not.toHaveBeenCalled()
    expect(fetch).toHaveBeenCalledTimes(1)
  })
  it('only recognizes exact Zoho CRM hosts and versioned paths', () => {
    expect(isZohoCrmRequest('https://www.zohoapis.com/crm/v8/Deals')).toBe(true)
    expect(isZohoCrmRequest('https://www.zohoapis.com/books/v3/invoices')).toBe(false)
    expect(isZohoCrmRequest('https://www.zohoapis.com.evil.test/crm/v8/Deals')).toBe(false)
  })
  it('leaves current behavior unchanged until explicitly activated', async () => {
    vi.stubEnv('ZOHO_CRM_REQUEST_ACCOUNTING', 'off')
    const fetch = vi.fn().mockResolvedValue(new Response('{}'))
    vi.stubGlobal('fetch', fetch)
    await crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(prisma.$transaction).not.toHaveBeenCalled()
  })
  it('fails closed before network access if the reservation database fails', async () => {
    vi.stubEnv('ZOHO_CRM_REQUEST_ACCOUNTING', 'on')
    vi.mocked(prisma.$transaction).mockRejectedValueOnce(new Error('unavailable'))
    const fetch = vi.fn(); vi.stubGlobal('fetch', fetch)
    await expect(crmBudgetFetch('https://www.zohoapis.com/crm/v8/Deals')).rejects.toThrow('DATABASE_UNAVAILABLE')
    expect(fetch).not.toHaveBeenCalled()
  })
})
