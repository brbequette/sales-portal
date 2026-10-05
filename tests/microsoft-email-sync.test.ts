// @vitest-environment node
import { beforeEach, afterEach, expect, it, vi } from 'vitest'
const m = vi.hoisted(() => ({ mailbox: { findUnique: vi.fn(), findMany: vi.fn(), update: vi.fn() }, setting: { findUnique: vi.fn(), create: vi.fn(), updateMany: vi.fn() }, email: { upsert: vi.fn(), update: vi.fn() }, contact: { findMany: vi.fn() }, events: { createMany: vi.fn() }, attachment: { upsert: vi.fn() }, fetch: vi.fn(), store: null as null | { key: string; value: string } }))
vi.mock('@/lib/prisma', () => ({ prisma: { emailMailbox: m.mailbox, systemSetting: m.setting, email: m.email, contact: m.contact, emailOperationalEvent: m.events, emailAttachment: m.attachment } }))
vi.mock('@/lib/email-operational-intelligence', () => ({ plainTextFromHtml: (s: string) => s, extractOperationalEvents: () => [{ eventType: 'SHIPMENT_CONFIRMED', confidence: .8, summary: 'Review shipment', data: {} }], matchOperationalEvent: async () => ({ accountId: null }), eventFingerprint: (s: string) => s, attachmentClassification: () => 'OTHER' }))
import { syncMicrosoftMailbox } from '../src/lib/microsoft-graph-mail'
const next = 'https://graph.microsoft.com/v1.0/users/sales%40example.com/mailFolders/inbox/messages/delta?$skiptoken=page2'
const delta = 'https://graph.microsoft.com/v1.0/users/sales%40example.com/mailFolders/inbox/messages/delta?$deltatoken=done'
const message = (id: string) => ({ id, subject: 'Shipping notice', body: { content: 'On the way', contentType: 'text' }, from: { emailAddress: { address: 'vendor@example.com' } }, receivedDateTime: '2026-10-01T12:00:00Z' })
let page: any
beforeEach(() => {
  vi.clearAllMocks(); m.store = null
  vi.stubEnv('MICROSOFT_CLIENT_ID', 'test-client'); vi.stubEnv('MICROSOFT_CLIENT_SECRET', 'test-only'); vi.stubEnv('MICROSOFT_TENANT_ID', 'test-tenant')
  m.mailbox.findUnique.mockResolvedValue({ id: 'box', address: 'sales@example.com', enabled: true, provider: 'MICROSOFT_365', includeInbox: true, includeSent: true, lookbackDays: 90, userId: 'rep' })
  m.setting.findUnique.mockImplementation(async () => m.store ? { ...m.store } : null)
  m.setting.create.mockImplementation(async ({ data }) => { m.store = { ...data }; return m.store })
  m.setting.updateMany.mockImplementation(async ({ where, data }) => { if (m.store?.value !== where.value) return { count: 0 }; m.store!.value = data.value; return { count: 1 } })
  m.email.upsert.mockImplementation(async ({ create }) => ({ ...create, id: create.externalMessageId }))
  m.email.update.mockResolvedValue({}); m.mailbox.update.mockResolvedValue({}); m.contact.findMany.mockResolvedValue([]); m.events.createMany.mockResolvedValue({ count: 1 })
  page = { value: [message('m1')], '@odata.nextLink': next }
  m.fetch.mockImplementation(async (url: string) => url.includes('login.microsoftonline') ? Response.json({ access_token: 'unit-test-token' }) : Response.json(page))
  vi.stubGlobal('fetch', m.fetch)
})
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs() })
it('persists a real continuation and alternates Inbox/Sent without falsely completing history', async () => {
  const result = await syncMicrosoftMailbox({ mailboxId: 'box' })
  expect(result).toMatchObject({ processed: 1, createdEvents: 1, pending: true })
  expect(JSON.parse(m.store!.value)).toMatchObject({ cursors: { inbox: next }, nextFolder: 'sentitems' })
  expect(JSON.parse(m.store!.value).lease).toBeUndefined()
  expect(m.email.upsert.mock.calls[0][0].create.needsResponse).toBeUndefined()
})
it('resumes a partial page without reprocessing successful messages', async () => {
  page = { value: [message('m1'), message('m2')], '@odata.nextLink': next }
  m.email.upsert.mockImplementationOnce(async ({ create }) => ({ ...create, id: 'm1' })).mockRejectedValueOnce(new Error('temporary DB failure'))
  const first = await syncMicrosoftMailbox({ mailboxId: 'box' })
  expect(first.errors).toEqual(['temporary DB failure']); expect(JSON.parse(m.store!.value).completedMessageIds).toEqual(['m1'])
  expect(JSON.parse(m.store!.value).cursors.inbox).toBeUndefined()
  m.email.upsert.mockClear()
  const second = await syncMicrosoftMailbox({ mailboxId: 'box' })
  expect(second.processed).toBe(1); expect(m.email.upsert.mock.calls[0][0].create.externalMessageId).toBe('m2')
  expect(JSON.parse(m.store!.value).completedMessageIds).toEqual([])
})
it('uses insert-only events so retries never reset a reviewer decision', async () => {
  m.events.createMany.mockResolvedValue({ count: 0 })
  expect((await syncMicrosoftMailbox({ mailboxId: 'box' })).createdEvents).toBe(0)
  expect(m.events.createMany.mock.calls[0][0]).toMatchObject({ skipDuplicates: true, data: [{ sourceFingerprint: 'sales@example.com:m1' }] })
})
it('blocks concurrent mailbox sync before requesting OAuth', async () => {
  m.store = { key: 'email-intelligence-sync:box', value: JSON.stringify({ until: Date.now() + 60000 }) }
  await expect(syncMicrosoftMailbox({ mailboxId: 'box' })).rejects.toThrow('already syncing')
  expect(m.fetch).not.toHaveBeenCalled()
})
it('does not read disabled or malformed mailboxes', async () => {
  const record = await m.mailbox.findUnique()
  m.mailbox.findUnique.mockResolvedValue({ ...record, enabled: false })
  await expect(syncMicrosoftMailbox({ mailboxId: 'box' })).rejects.toThrow('enabled')
  m.mailbox.findUnique.mockResolvedValue({ ...record, address: 'sales@example.com\\' })
  await expect(syncMicrosoftMailbox({ mailboxId: 'box' })).rejects.toThrow('invalid mailbox')
  expect(m.fetch).not.toHaveBeenCalled()
})
it('honors Microsoft throttling across invocations', async () => {
  m.fetch.mockImplementation(async (url: string) => url.includes('login.microsoftonline') ? Response.json({ access_token: 'test' }) : new Response('', { status: 429, headers: { 'Retry-After': '600' } }))
  await expect(syncMicrosoftMailbox({ mailboxId: 'box' })).rejects.toThrow('429')
  const calls = m.fetch.mock.calls.length
  const result = await syncMicrosoftMailbox({ mailboxId: 'box' })
  expect(result.errors[0]).toContain('pause'); expect(m.fetch).toHaveBeenCalledTimes(calls)
})
it('clears an expired Graph cursor for a safe idempotent rescan', async () => {
  await syncMicrosoftMailbox({ mailboxId: 'box' })
  const state = JSON.parse(m.store!.value); state.nextFolder = 'inbox'; m.store!.value = JSON.stringify(state)
  m.fetch.mockImplementation(async (url: string) => url.includes('login.microsoftonline') ? Response.json({ access_token: 'test' }) : new Response('', { status: 410 }))
  await expect(syncMicrosoftMailbox({ mailboxId: 'box' })).rejects.toThrow('410')
  expect(JSON.parse(m.store!.value).cursors.inbox).toBeUndefined()
})
it('ignores deletion tombstones without deleting stored sales history', async () => {
  page = { value: [{ id: 'old', '@removed': { reason: 'deleted' } }], '@odata.deltaLink': delta }
  await syncMicrosoftMailbox({ mailboxId: 'box' })
  expect(m.email.upsert).not.toHaveBeenCalled(); expect(m.events.createMany).not.toHaveBeenCalled()
})

it('imports attachment metadata without selecting file-only properties or downloading contents', async () => {
  page = { value: [{ ...message('with-file'), hasAttachments: true }], '@odata.nextLink': next }
  m.fetch.mockImplementation(async (url: string) => {
    if (url.includes('login.microsoftonline')) return Response.json({ access_token: 'test' })
    if (url.includes('/attachments?')) {
      const fields = new URL(url).searchParams.get('$select')!.split(',')
      const supported = ['id', 'name', 'contentType', 'size', 'isInline']
      if (fields.some(field => !supported.includes(field))) return new Response('', { status: 400 })
      return Response.json({ value: [{ id: 'file1', name: 'quote.pdf', contentType: 'application/pdf', size: 1024, isInline: false }] })
    }
    return Response.json(page)
  })
  const result = await syncMicrosoftMailbox({ mailboxId: 'box' })
  expect(result.errors).toEqual([])
  expect(result.processed).toBe(1)
  expect(m.attachment.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ emailId: 'with-file', name: 'quote.pdf', size: 1024 }) }))
  expect(JSON.parse(m.store!.value).nextFolder).toBe('sentitems')
})
