import { beforeEach, describe, expect, it, vi } from 'vitest'
import { NextRequest } from 'next/server'
const m = vi.hoisted(() => ({ upsert: vi.fn(), status: vi.fn(), clock: 0, paused: false, token: vi.fn(), fetch: vi.fn() }))
vi.mock('next-auth', () => ({ getServerSession: async () => ({ user: { id: 'user', role: 'ADMIN' } }) }))
vi.mock('@/lib/auth', () => ({ authOptions: {} }))
vi.mock('@/lib/zoho-auth', () => ({ getZohoAccessToken: m.token, ZOHO_ORGANIZATION_ID: 'fixture' }))
vi.mock('@/lib/cost-calculations', () => ({ calculateDocumentCosts: vi.fn() }))
vi.mock('@/lib/sync-config', () => ({
 SYNC_TABLES: ['leads','accounts','salesOrders'],
 getSyncConfig: async () => Object.fromEntries(['leads','accounts','salesOrders'].map(t => [t,{ enabled: false }])),
 getSyncStatus: async () => Object.fromEntries(['leads','accounts','salesOrders'].map(t => [t,{ lastSyncAt: null, continuationPage: 1 }])),
 isTableStale: () => true, updateTableSyncStatus: m.status,
}))
vi.mock('@/lib/prisma', () => ({ prisma: {
 systemSetting: { findUnique: async () => ({value: m.paused ? 'true' : 'false'}), upsert: async () => ({}), updateMany: async () => ({count:1}), update: async () => ({}) },
 user: { findMany: async () => [{id:'user',zohoId:'owner',email:'fixture@example.test'}] },
 account: { findMany: async () => [{id:'account',zohoId:'customer',name:'Recipient'}], upsert: m.upsert },
 salesOrder: { findMany: async () => [], upsert: m.upsert },
 lead: { upsert: m.upsert }, $transaction: async (batch: unknown[]) => Promise.all(batch),
} }))
import { POST } from './route'
async function run(table: string) {
 return (await POST(new NextRequest('https://example.test/api/sync-now',{method:'POST',body:JSON.stringify({tables:[table],force:true})}))).json()
}
beforeEach(() => { vi.restoreAllMocks(); m.clock=0; m.paused=false; m.token.mockReset().mockResolvedValue('fixture'); m.fetch.mockReset(); m.upsert.mockReset().mockResolvedValue({}); m.status.mockReset(); vi.stubGlobal('fetch',m.fetch); vi.spyOn(Date,'now').mockImplementation(() => m.clock) })
describe('bounded manual sync', () => {
 it('honors the emergency pause even for forced manual runs, before token or provider calls', async () => {
  m.paused=true
  expect((await run('leads')).error).toContain('paused')
  expect(m.token).not.toHaveBeenCalled()
  expect(m.fetch).not.toHaveBeenCalled()
 })
 it.each(['leads','accounts'])('requests required CRM fields for %s', async table => {
  m.fetch.mockImplementation(async (url: string) => {
   const fields=new URL(url).searchParams.get('fields')
   expect(fields).toContain('Owner'); expect(fields).toContain('Modified_Time')
   return new Response(JSON.stringify({data:[],info:{more_records:false}}),{status:200})
  })
  expect((await run(table)).results[table].error).toBeUndefined()
  expect(m.fetch).toHaveBeenCalledTimes(1)
 })
 it('persists orders after a list fetch exceeds the former eight-second limit without detail calls', async () => {
  m.fetch.mockImplementation(async () => {m.clock=9000; return new Response(JSON.stringify({salesorders:[{salesorder_id:'so',customer_id:'customer',status:'confirmed',total:10,date:'2026-10-01'}],page_context:{has_more_page:true}}))})
  const result=await run('salesOrders')
  expect(result.results.salesOrders.synced).toBe(1)
  expect(m.fetch).toHaveBeenCalledTimes(1)
  expect(m.upsert).toHaveBeenCalledWith(expect.objectContaining({where:{zohoId:'so'}}))
  expect(m.status).toHaveBeenCalledWith('salesOrders',expect.objectContaining({continuationPage:2}))
  expect(m.status.mock.calls[0][1]).not.toHaveProperty('lastSyncAt')
 })
 it('does not advance the page when saving fails',async()=>{
  m.fetch.mockResolvedValue(new Response(JSON.stringify({salesorders:[{salesorder_id:'so',customer_id:'customer',status:'confirmed',total:10}],page_context:{has_more_page:true}})))
  m.upsert.mockRejectedValue(new Error('database unavailable'))
  const result=await run('salesOrders')
  expect(result.results.salesOrders.error).toContain('database unavailable')
  expect(m.status.mock.calls[0][1]).not.toHaveProperty('continuationPage')
  expect(m.status.mock.calls[0][1]).not.toHaveProperty('lastSyncAt')
 })
 it('retains the checkpoint after a provider rate-limit error and does not retry',async()=>{
  m.fetch.mockResolvedValue(new Response('quota exceeded',{status:429}))
  const result=await run('leads')
  expect(result.results.leads.error).toContain('429')
  expect(m.fetch).toHaveBeenCalledTimes(1)
  expect(m.upsert).not.toHaveBeenCalled()
  expect(m.status.mock.calls[0][1]).not.toHaveProperty('lastSyncAt')
 })
})
