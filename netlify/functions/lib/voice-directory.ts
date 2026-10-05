import { getZohoVoiceAccessToken } from './zoho-voice-auth'
import { prisma } from './prisma'
import { isAdministratorRole } from '../../../src/lib/roles'

export type VoiceUser = { userid: string; agentId: string; name: string; emailid: string; extension?: number; status: number; zvtRole: number; zvtRoleName?: string; timezone?: string; lang?: string; departmentName?: string; canEdit?: boolean; isCurrentUser?: boolean; associatedAgents?: string[]; [key: string]: unknown }
export type VoiceNumber = { id: string; numberId: string; numberMapId: string; number: string; label: string; active: boolean; isDefault: boolean; smsCapability: 'provider_checked'; [key: string]: unknown }
export const normalizeVoiceNumber = (value: string) => value.replace(/[^\d+]/g, '')
export async function voiceRequest(path: string, init: RequestInit = {}) {
  const token = await getZohoVoiceAccessToken()
  const dc = process.env.ZOHO_DC || 'com'
  if (!['com', 'eu', 'in', 'com.au', 'jp', 'ca'].includes(dc)) throw new Error('Unsupported Voice region')
  const res = await fetch(`https://voice.zoho.${dc}/rest/json/${path}`, { ...init, headers: { Authorization: `Zoho-oauthtoken ${token}`, Accept: 'application/json', ...init.headers }, signal: AbortSignal.timeout(20000), cache: 'no-store' })
  const body = await res.json().catch(() => ({}))
  if (!res.ok || String(body.code) !== '200' || body.status !== 'SUCCESS') throw new Error(`Zoho Voice rejected the request (${body.code || res.status}): ${String(body.message || 'Check Voice permissions and configuration').slice(0, 200)}`)
  return body
}
async function pages(path: string, key: string, size: number) {
  const all: Record<string, any>[] = []
  for (let from = 0; from < 5000; from += size) {
    const result = await voiceRequest(`${path}${path.includes('?') ? '&' : '?'}from=${from}&offset=${size}`)
    if (!Array.isArray(result[key])) throw new Error('Unexpected Voice inventory response')
    all.push(...result[key]); if (result[key].length < size) return all
  }
  throw new Error('Voice inventory exceeded the safe pagination limit')
}
export const listVoiceUsers = async () => await pages('zv/api/users', 'users', 50) as VoiceUser[]
export async function listVoiceNumbers(agentId?: string): Promise<VoiceNumber[]> {
  if (agentId && !/^\d+$/.test(agentId)) throw new Error('Invalid Voice agent')
  const rows = await pages(`zv/api/v1/numberslist${agentId ? '?agentId=' + agentId : ''}`, 'numberslist', 100)
  return rows.map(n => ({ ...n, id: String(n.numberId), numberId: String(n.numberId), numberMapId: String(n.numberMapId), number: normalizeVoiceNumber(String(n.number)), label: String(n.displayName || n.number), name: String(n.displayName || n.number), active: n.isActive === true && n.isIncomingOrOutgoingActive === true && Number(n.isEnabled) === 1, isDefault: false, smsCapability: 'provider_checked' }))
}
export async function voiceIdentity(caller: { dbId?: string; userId?: string }) {
  const id = caller.dbId || caller.userId
  const user = id ? await prisma.user.findUnique({ where: { id } }) : null
  if (!user || (user.lockedUntil && user.lockedUntil > new Date())) throw new Error('Authorized application user required')
  return { user, admin: isAdministratorRole(user.role) }
}
export async function voiceInventory(caller: { dbId?: string; userId?: string }) {
  const { user, admin } = await voiceIdentity(caller)
  const users = await listVoiceUsers()
  const matches = users.filter(u => u.emailid.toLowerCase() === user.email.toLowerCase() && u.status === 1)
  // A missing/ambiguous provider identity never grants a rep organization-wide access.
  const numbers = admin ? await listVoiceNumbers() : matches.length === 1 ? await listVoiceNumbers(matches[0].agentId) : []
  return { numbers, users: users.map(u => ({ userid: u.userid, agentId: u.agentId, name: u.name, emailid: admin ? u.emailid : undefined, extension: u.extension, status: u.status, zvtRoleName: u.zvtRoleName })), admin, matched: matches.length === 1, fetchedAt: new Date().toISOString() }
}
export async function requireVoiceSender(caller: { dbId?: string; userId?: string }, requested: string) {
  if (!requested) throw new Error('Select an assigned Zoho Voice number')
  const { user } = await voiceIdentity(caller)
  if (user.role.toUpperCase() === 'VIEWER') throw new Error('View-only users cannot call or send messages')
  const inventory = await voiceInventory(caller)
  const selected = inventory.numbers.find(n => n.number === normalizeVoiceNumber(requested) && n.active)
  if (!selected) throw new Error('This number is inactive or is no longer assigned to you in Zoho Voice. Refresh the number list.')
  return selected
}
