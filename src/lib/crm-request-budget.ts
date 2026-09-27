import { randomUUID } from 'node:crypto'
import { Prisma } from '@prisma/client'
import { prisma } from './prisma'

export const CRM_BUDGET_KEY = 'crm_request_budget_v1'
export type CrmBudget = {
  version: 1
  mode: 'observe' | 'enforce'
  allowanceId: string
  observedFrom: string
  expiresAt: string | null
  baselineVerified: boolean
  baselineRequests: number
  limit: number
  reserved: number
  responses: number
  uncertain: number
  maxInFlight: number
  pending: Record<string, string>
  haltReason: string | null
  notBefore: string | null
  remainingCredits: number | null
  remainingCreditsObservedAt: string | null
}

/** This error proves only this CRM request was not sent, not that an earlier write was not sent. */
export class CrmBudgetBlocked extends Error {
  constructor(public readonly code: string) { super(`CRM_BUDGET_${code}`); this.name = 'CrmBudgetBlocked' }
}

export function initialCrmBudget(now: Date): CrmBudget {
  return { version: 1, mode: 'observe', allowanceId: randomUUID(), observedFrom: now.toISOString(), expiresAt: null,
    baselineVerified: false, baselineRequests: 0, limit: 50000, reserved: 0, responses: 0, uncertain: 0,
    maxInFlight: 1, pending: {}, haltReason: null, notBefore: null, remainingCredits: null, remainingCreditsObservedAt: null }
}

export function parseCrmBudget(value: string): CrmBudget {
  let s: CrmBudget
  try { s = JSON.parse(value) } catch { throw new CrmBudgetBlocked('INVALID_STATE') }
  const integer = (n: unknown) => typeof n === 'number' && Number.isSafeInteger(n) && n >= 0
  const date = (d: unknown) => typeof d === 'string' && Number.isFinite(Date.parse(d))
  if (!s || s.version !== 1 || !['observe', 'enforce'].includes(s.mode) || typeof s.allowanceId !== 'string' || !s.allowanceId ||
    !date(s.observedFrom) || (s.expiresAt !== null && !date(s.expiresAt)) || typeof s.baselineVerified !== 'boolean' ||
    ![s.baselineRequests, s.limit, s.reserved, s.responses, s.uncertain, s.maxInFlight].every(integer) ||
    !integer(s.baselineRequests + s.reserved) ||
    s.limit < 1 || s.limit > 50000 || s.maxInFlight < 1 || s.maxInFlight > 10 ||
    !s.pending || typeof s.pending !== 'object' || Array.isArray(s.pending) || !Object.values(s.pending).every(date) ||
    s.responses + s.uncertain + Object.keys(s.pending).length !== s.reserved ||
    (s.haltReason !== null && typeof s.haltReason !== 'string') || (s.notBefore !== null && !date(s.notBefore)) ||
    (s.remainingCredits !== null && !integer(s.remainingCredits)) ||
    (s.remainingCreditsObservedAt !== null && !date(s.remainingCreditsObservedAt))) throw new CrmBudgetBlocked('INVALID_STATE')
  return s
}

export function reserveCrmBudget(s: CrmBudget, id: string, now: Date): CrmBudget {
  if (!Number.isSafeInteger(s.baselineRequests + s.reserved + 1)) throw new CrmBudgetBlocked('COUNTER_OVERFLOW')
  if (Object.hasOwn(s.pending, id)) throw new CrmBudgetBlocked('DUPLICATE_RESERVATION')
  if (Object.keys(s.pending).length >= 1024) throw new CrmBudgetBlocked('UNRESOLVED_RESERVATIONS')
  if (s.mode === 'enforce') {
    if (!s.baselineVerified || !s.expiresAt) throw new CrmBudgetBlocked('BASELINE_REQUIRED')
    if (Date.parse(s.expiresAt) <= now.getTime()) throw new CrmBudgetBlocked('ALLOWANCE_EXPIRED')
    if (s.haltReason) throw new CrmBudgetBlocked('HALTED')
    if (s.baselineRequests + s.reserved >= s.limit) throw new CrmBudgetBlocked('LIMIT')
    if (s.notBefore && Date.parse(s.notBefore) > now.getTime()) throw new CrmBudgetBlocked('COOLDOWN')
    if (Object.keys(s.pending).length >= s.maxInFlight) throw new CrmBudgetBlocked('CONCURRENCY')
  }
  return { ...s, reserved: s.reserved + 1, pending: { ...s.pending, [id]: now.toISOString() } }
}

export type CrmBudgetOutcome = { status?: number; remainingCredits?: number; retryAfterSeconds?: number }
export function completeCrmBudget(s: CrmBudget, id: string, outcome: CrmBudgetOutcome, now: Date): CrmBudget {
  if (!Object.hasOwn(s.pending, id)) return s // A repeated completion never increments or refunds the budget.
  const pending = { ...s.pending }; delete pending[id]
  const next = { ...s, pending, responses: s.responses + (outcome.status ? 1 : 0), uncertain: s.uncertain + (outcome.status ? 0 : 1) }
  if (outcome.remainingCredits !== undefined) {
    next.remainingCredits = outcome.remainingCredits
    next.remainingCreditsObservedAt = now.toISOString()
  }
  if (!outcome.status) next.haltReason = 'UNCERTAIN_REQUEST'
  if (outcome.status === 401 || outcome.status === 403) next.haltReason = 'AUTHENTICATION'
  if (outcome.remainingCredits === 0) next.haltReason = 'PROVIDER_CREDITS_EXHAUSTED'
  if (outcome.status === 429) {
    const until = now.getTime() + Math.max(60, outcome.retryAfterSeconds || 60) * 1000
    next.notBefore = new Date(Math.max(until, s.notBefore ? Date.parse(s.notBefore) : 0)).toISOString()
  }
  return next
}

/** Row locking serializes reservations across Next.js, scheduled functions, and warm/cold processes. */
export async function changeCrmBudget(db: Pick<typeof prisma, '$transaction'>, change: (s: CrmBudget, now: Date) => CrmBudget) {
  return db.$transaction(async (tx: Prisma.TransactionClient) => {
    // Prisma's empty-update upsert can race on first creation. Let PostgreSQL
    // arbitrate the insert, then lock the committed row before reading counters.
    await tx.$executeRaw`INSERT INTO "SystemSetting" (key, value, "updatedAt") VALUES (${CRM_BUDGET_KEY}, ${JSON.stringify(initialCrmBudget(new Date()))}, clock_timestamp()) ON CONFLICT (key) DO NOTHING`
    const [row] = await tx.$queryRaw<{ value: string; now: Date }[]>`SELECT value, clock_timestamp() AS now FROM "SystemSetting" WHERE key=${CRM_BUDGET_KEY} FOR UPDATE`
    if (!row) throw new CrmBudgetBlocked('STATE_MISSING')
    const next = change(parseCrmBudget(row.value), row.now)
    await tx.systemSetting.update({ where: { key: CRM_BUDGET_KEY }, data: { value: JSON.stringify(next) } })
    return next
  }, { maxWait: 3000, timeout: 5000 })
}

export function isZohoCrmRequest(input: RequestInfo | URL): boolean {
  try {
    const u = new URL(typeof input === 'string' || input instanceof URL ? input : input.url)
    return u.protocol === 'https:' && /^www\.zohoapis\.(com|eu|in|com\.au|jp|ca|com\.cn|sa)$/.test(u.hostname) && /^\/crm\/v\d+(\/|$)/.test(u.pathname)
  } catch { return false }
}

/** Non-CRM traffic remains untouched. Activation is deliberately separate from deploying the wrapper. */
export const crmBudgetFetch: typeof fetch = async (input, init) => {
  if (!isZohoCrmRequest(input)) return fetch(input, init)
  const activation = process.env.ZOHO_CRM_REQUEST_ACCOUNTING
  if (!activation || activation === 'off') return fetch(input, init)
  if (activation !== 'on') throw new CrmBudgetBlocked('INVALID_ACTIVATION')
  const id = randomUUID()
  try { await changeCrmBudget(prisma, (s, now) => reserveCrmBudget(s, id, now)) }
  catch (error) { if (error instanceof CrmBudgetBlocked) throw error; throw new CrmBudgetBlocked('DATABASE_UNAVAILABLE') }
  let response: Response
  let body: ArrayBuffer
  try {
    const originalSignal = init?.signal || (input instanceof Request ? input.signal : undefined)
    const timeout = AbortSignal.timeout(30000)
    response = await fetch(input, { ...init, redirect: 'error', signal: originalSignal ? AbortSignal.any([originalSignal, timeout]) : timeout })
    // Keep the reservation until the body finishes, including attachment downloads. No implicit redirect request.
    body = await response.arrayBuffer()
  } catch (error) {
    try { await changeCrmBudget(prisma, (s, now) => completeCrmBudget(s, id, {}, now)) }
    catch { throw new Error('CRM_BUDGET_UNCERTAIN_RESULT_UNRECORDED') }
    throw error
  }
  const remaining = response.headers.get('x-api-credits-remaining')
  const retry = response.headers.get('retry-after')
  const remainingCredits = remaining !== null && /^\d+$/.test(remaining) && Number.isSafeInteger(Number(remaining)) ? Number(remaining) : undefined
  const retryAfterSeconds = retry && /^\d+$/.test(retry) ? Math.min(Number(retry), 86400) : retry && Number.isFinite(Date.parse(retry)) ? Math.min(86400, Math.max(0, (Date.parse(retry) - Date.now()) / 1000)) : undefined
  try { await changeCrmBudget(prisma, (s, now) => completeCrmBudget(s, id, { status: response.status, remainingCredits, retryAfterSeconds }, now)) }
  catch { throw new Error('CRM_BUDGET_RESULT_UNRECORDED') }
  return new Response([204, 205, 304].includes(response.status) ? null : body, { status: response.status, statusText: response.statusText, headers: response.headers })
}
