import { beforeEach, describe, expect, it, vi } from 'vitest'
const db = vi.hoisted(() => ({ user: { findMany: vi.fn(), findFirst: vi.fn() }, monthlyVigGoal: { findUnique: vi.fn() }, systemSetting: { findUnique: vi.fn() } }))
vi.mock('../../netlify/functions/lib/prisma', () => ({ prisma: db }))
vi.mock('./prisma', () => ({ prisma: db }))
import { resolveVigRate as netlifyVig } from '../../netlify/functions/lib/cost-calculations'
import { resolveVigRate as nextVig } from './cost-calculations'
import { DEFAULT_SETTINGS } from '../../netlify/functions/lib/settings'
import { DEFAULT_SETTINGS as NEXT_SETTINGS } from './settings'
import type { BusinessDefaults } from './business-defaults'

describe.each([
  ['Netlify', (doc: any) => netlifyVig(doc, DEFAULT_SETTINGS)],
  ['Next', (doc: any) => nextVig(doc, NEXT_SETTINGS, null, { defaultVigRate: 1.3 } as BusinessDefaults)],
] as const)('%s invoice VIG history', (_label, resolve) => {
  beforeEach(() => {
    const rep={id:'rep',name:'TEST REP',constantVigEnabled:false,constantVigValue:null}
    db.user.findMany.mockResolvedValue([rep]); db.user.findFirst.mockResolvedValue(rep)
    db.monthlyVigGoal.findUnique.mockResolvedValue(null); db.systemSetting.findUnique.mockResolvedValue(null)
  })
  const invoice={invoice_id:'invoice',date:'2025-05-01',salesperson_name:'TEST REP',custom_fields:[{api_name:'cf_salesperson_vig',value:1.5}]}
  it('retains a recorded penalty when legacy goal JSON is empty', async()=>{
    expect(await resolve(invoice)).toBe(1.5)
  })
  it('uses an explicit monthly override ahead of a stored penalty', async()=>{
    db.monthlyVigGoal.findUnique.mockResolvedValue({manualVigRate:1.3})
    expect(await resolve(invoice)).toBe(1.3)
  })
  it('preserves a pre-2025 explicit monthly exception', async()=>{
    db.monthlyVigGoal.findUnique.mockResolvedValue({manualVigRate:1.5})
    expect(await resolve({...invoice,date:'2024-12-01'})).toBe(1.5)
  })
  it('keeps Montgomery at 1.0', async()=>{
    expect(await resolve({...invoice,salesperson_name:'MONTGOMERY MORGAN'})).toBe(1)
  })
  it('does not apply the invoice historical fallback to quotes', async()=>{
    expect(await resolve({...invoice,invoice_id:undefined,estimate_id:'quote'})).toBe(1.3)
  })
})
