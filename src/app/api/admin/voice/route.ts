import { NextRequest, NextResponse } from 'next/server'
import { authenticateRequest } from '../../../../../netlify/functions/lib/auth-middleware'
import { listVoiceNumbers, listVoiceUsers, voiceIdentity, voiceRequest } from '../../../../../netlify/functions/lib/voice-directory'
import { prisma } from '@/lib/prisma'
import { createHash } from 'node:crypto'
const hash = (v: unknown) => createHash('sha256').update(JSON.stringify(v)).digest('hex')
const idValid = (v: unknown): v is string => typeof v === 'string' && /^\d+$/.test(v)
async function authorize(req: Request) {
  const caller = await authenticateRequest(req)
  const identity = await voiceIdentity(caller)
  if (!identity.admin) throw new Error('Administrator access required')
  return identity.user
}
async function detail(id: string) {
  const result = await voiceRequest('zv/api/users/' + id)
  const user = result.users
  if (!user || Array.isArray(user) || String(user.userid) !== id) throw new Error('Unexpected Voice user response')
  const numbers = await listVoiceNumbers(String(user.agentId))
  return { user, numbers, revision: hash({ user, numbers: numbers.map(n => n.numberMapId).sort() }) }
}
export async function GET(req: NextRequest) {
  try {
    await authorize(req)
    const id = req.nextUrl.searchParams.get('userId')
    if (id) { if (!idValid(id)) throw new Error('Invalid user ID'); return NextResponse.json({ success: true, ...await detail(id) }, { headers: { 'Cache-Control': 'no-store' } }) }
    return NextResponse.json({ success: true, users: await listVoiceUsers(), numbers: await listVoiceNumbers() }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (e) { return NextResponse.json({ success: false, error: e instanceof Error ? e.message : 'Voice unavailable' }, { status: 403 }) }
}
export async function POST(req: NextRequest) {
  let operationKey = ''; let started = false
  try {
    const actor = await authorize(req)
    if (req.headers.get('origin') !== new URL(req.url).origin) throw new Error('Same-origin request required')
    const body = await req.json()
    if (!['create', 'update', 'delete'].includes(body.action) || body.confirmed !== true || !/^[a-f0-9-]{36}$/.test(body.requestId || '')) throw new Error('Confirm the exact change before submitting')
    const current = body.action === 'create' ? null : idValid(body.userId) ? await detail(body.userId) : null
    if (body.action !== 'create' && (!current || current.revision !== body.revision)) throw new Error('Voice user changed. Reload and review before saving.')
    if (current && current.user.canEdit !== true) throw new Error('Zoho does not allow editing this user')
    if (current && (current.user.zvtRole === 0 || current.user.isCurrentUser)) throw new Error('Manage the current user and super-administrator directly in Zoho Voice')
    const fields = body.fields || {}
    const data: Record<string, unknown> = {}
    const allowed = ['name', 'emailid', 'lang', 'timezone', 'departmentName', 'extension', 'zvtRole', 'associatedNumbers', 'associatedAgents', 'isModerator']
    if (Object.keys(fields).some(k => !allowed.includes(k))) throw new Error('Unsupported user field')
    for (const key of ['name', 'emailid', 'lang', 'timezone', 'departmentName']) {
      const value = fields[key] ?? current?.user[key]
      if (value !== undefined) { if (typeof value !== 'string' || value.length > 200) throw new Error('Invalid ' + key); data[key] = value }
    }
    if (body.action !== 'delete' && (!data.name || typeof data.emailid !== 'string' || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.emailid))) throw new Error('Name and valid email required')
    const role = Number(fields.zvtRole ?? current?.user.zvtRole ?? 5)
    if (![1, 2, 3, 4, 5].includes(role)) throw new Error('Unsupported role')
    data.zvtRole = role
    if (fields.extension !== undefined) { if (!/^\d{1,8}$/.test(String(fields.extension))) throw new Error('Invalid extension'); data.extension = Number(fields.extension) }
    if (fields.associatedNumbers !== undefined) {
      const numbers = await listVoiceNumbers()
      if (!Array.isArray(fields.associatedNumbers) || fields.associatedNumbers.length > numbers.length || fields.associatedNumbers.some((n: any) => !numbers.some(v => v.numberMapId === n.numberMapId) || typeof n.allowNumberEdit !== 'boolean')) throw new Error('Invalid number assignments')
      data.associatedNumbers = fields.associatedNumbers.map((n: any) => ({ numberMapId: n.numberMapId, allowNumberEdit: n.allowNumberEdit }))
    }
    if (fields.associatedAgents !== undefined) {
      const users = await listVoiceUsers()
      if (!Array.isArray(fields.associatedAgents) || fields.associatedAgents.some((id: string) => !users.some(u => u.agentId === id))) throw new Error('Invalid supervised agents')
      data.associatedAgents = fields.associatedAgents
    }
    if (fields.isModerator !== undefined) {
      if (typeof fields.isModerator !== 'boolean' || current?.user.canChangeModerator !== true) throw new Error('Zoho does not allow changing moderator access')
      data.isModerator = fields.isModerator
    }
    if (current) data.userid = body.userId
    const entityId = body.userId || String(data.emailid).toLowerCase()
    if (body.action === 'create' && (await listVoiceUsers()).some(u => u.emailid.toLowerCase() === String(data.emailid).toLowerCase())) throw new Error('A Voice user with this email already exists')
    const unresolved = await prisma.providerWriteOperation.findFirst({ where: { provider: 'ZOHO_VOICE', entityType: 'VOICE_USER', entityId, state: { in: ['SYNCING', 'AMBIGUOUS'] } } })
    if (unresolved) throw new Error('A previous change for this user is unresolved. Verify its outcome before another write.')
    operationKey = `zoho-voice:user:${actor.id}:${body.requestId}`
    const fingerprint = hash({ action: body.action, data, actor: actor.id })
    const operation = await prisma.providerWriteOperation.upsert({ where: { operationKey }, update: {}, create: { operationKey, provider: 'ZOHO_VOICE', entityType: 'VOICE_USER', entityId, operation: body.action, requestFingerprint: fingerprint } })
    if (operation.requestFingerprint !== fingerprint || operation.state !== 'PENDING') throw new Error('This request has already been submitted. Refresh Voice to check its result; it was not repeated.')
    const claim = await prisma.providerWriteOperation.updateMany({ where: { operationKey, state: 'PENDING' }, data: { state: 'SYNCING', lastAttemptAt: new Date(), attemptCount: { increment: 1 } } })
    if (claim.count !== 1) throw new Error('Request already in progress')
    started = true
    const result = body.action === 'delete'
      ? await voiceRequest('zv/api/users?userids=' + body.userId, { method: 'DELETE' })
      : await voiceRequest('zv/api/users', { method: body.action === 'create' ? 'POST' : 'PUT', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ data: JSON.stringify(data) }).toString() })
    if (Array.isArray(result.users) && result.users.some((u: any) => u.status !== 'SUCCESS')) throw new Error('Zoho reported a user-level error. Check queue dependencies in Voice before retrying.')
    const users = await listVoiceUsers()
    const id = String(result.userid || result.userId || body.userId || '')
    const verified = body.action === 'delete' ? !users.some(u => u.userid === body.userId) : users.some(u => u.userid === id && u.emailid === data.emailid && u.name === data.name)
    if (verified && body.action !== 'delete') {
      const after = await detail(id)
      for (const key of ['name', 'emailid', 'timezone', 'lang', 'departmentName', 'extension', 'zvtRole']) {
        if (data[key] !== undefined && String(after.user[key]) !== String(data[key])) throw new Error('Zoho did not confirm field ' + key + '. Review the user in Voice.')
      }
      if (Array.isArray(data.associatedNumbers) && hash(after.numbers.map(n => n.numberMapId).sort()) !== hash((data.associatedNumbers as any[]).map(n => n.numberMapId).sort())) throw new Error('Number assignment readback differed. Review Voice before retrying.')
    }
    if (!verified) throw new Error('Provider response could not be verified. Check Voice before retrying.')
    await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'SUCCEEDED', completedAt: new Date(), providerRecordIds: { userId: id }, providerMessage: 'Provider acknowledgment and user inventory readback verified' } })
    return NextResponse.json({ success: true, userId: id })
  } catch (e) {
    const error = e instanceof Error ? e.message : 'Voice update failed'
    if (started) await prisma.providerWriteOperation.update({ where: { operationKey }, data: { state: 'AMBIGUOUS', lastError: error, providerMessage: 'Check provider before any retry' } }).catch(() => {})
    return NextResponse.json({ success: false, error }, { status: 409 })
  }
}
