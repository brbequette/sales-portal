// @vitest-environment node
import { beforeEach, expect, it, vi } from 'vitest'
import { graphContinuationUrl, isMailboxAddress, normalizeMailboxAddress, sameOriginEmailRequest } from '../src/lib/email-intelligence-guards'
const db = vi.hoisted(() => ({ invoice: { findMany: vi.fn() }, salesOrder: { findMany: vi.fn() }, purchaseOrder: { findMany: vi.fn() }, package: { findMany: vi.fn() } }))
vi.mock('@/lib/prisma', () => ({ prisma: db }))
import { matchOperationalEvent } from '../src/lib/email-operational-intelligence'
beforeEach(() => { vi.clearAllMocks(); Object.values(db).forEach(model => model.findMany.mockResolvedValue([])) })
it('rejects the malformed live mailbox while preserving valid aliases', () => {
  expect(isMailboxAddress('ben@titandiamond.net\\')).toBe(false)
  expect(isMailboxAddress('Ben <ben@titandiamond.net>')).toBe(false)
  expect(isMailboxAddress(normalizeMailboxAddress(' SALES+orders@Example.com '))).toBe(true)
})
it('requires a same-origin browser write', () => {
  expect(sameOriginEmailRequest(new Request('https://www.tdusales.com/api/test', { headers: { origin: 'https://www.tdusales.com' } }))).toBe(true)
  expect(sameOriginEmailRequest(new Request('https://www.tdusales.com/api/test', { headers: { origin: 'https://evil.example' } }))).toBe(false)
  expect(sameOriginEmailRequest(new Request('https://www.tdusales.com/api/test'))).toBe(false)
})
it('never forwards Graph credentials to an off-site continuation', () => {
  expect(() => graphContinuationUrl('https://attacker.example/v1.0/users/a')).toThrow()
  expect(() => graphContinuationUrl('https://graph.microsoft.com@attacker.example/v1.0/users/a')).toThrow()
  expect(() => graphContinuationUrl('https://graph.microsoft.com/v1.0/me')).toThrow()
  expect(graphContinuationUrl('https://graph.microsoft.com/v1.0/users/a/messages?$skiptoken=opaque')).toContain('$skiptoken=opaque')
})
it('fails closed when identifiers belong to different accounts', async () => {
  db.invoice.findMany.mockResolvedValue([{ id: 'i', accountId: 'a' }]); db.salesOrder.findMany.mockResolvedValue([{ id: 'o', accountId: 'b' }])
  const result = await matchOperationalEvent({ invoiceNumber: 'INV1', salesOrderNumber: 'SO2' })
  expect(result.accountId).toBeNull(); expect(result.invoiceId).toBeNull(); expect(result.conflictReason).toContain('different')
})
it('never picks the first of ambiguous matching records', async () => {
  db.invoice.findMany.mockResolvedValue([{ id: 'i', accountId: 'a' }, { id: 'j', accountId: 'b' }])
  const result = await matchOperationalEvent({ invoiceNumber: 'INV1' })
  expect(result.accountId).toBeNull(); expect(result.matchConfidence).toBe(0)
})
it('matches a purchase order against its actual PO number field', async () => {
  db.purchaseOrder.findMany.mockResolvedValue([{ id: 'po' }])
  expect((await matchOperationalEvent({ poNumber: 'PO9' })).purchaseOrderId).toBe('po')
  expect(db.purchaseOrder.findMany).toHaveBeenCalledWith({ where: { poNumber: 'PO9' }, take: 2 })
})
