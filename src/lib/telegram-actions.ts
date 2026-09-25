import { createHash } from 'node:crypto'
import { prisma } from './prisma'
import { accountScope, agentAllowed, bindingKey, telegramEligible, type TelegramAgent, type TelegramBinding } from './telegram-policy'
import { assessTelegramReadiness } from './telegram-confidence'

type Action = 'create_task' | 'complete_task' | 'render_flyer'
type Proposal = { action: Action; agent: TelegramAgent; userId: string; nonce: string; expiresAt: number; args: Record<string, string>; expectedUpdatedAt?: string }
const policyKey = (userId: string, agent: TelegramAgent, action: Action) => `telegram:auto:${userId}:${agent}:${action}`
const clean = (value: unknown, max: number) => typeof value === 'string' ? value.trim().slice(0, max) : ''
const xml = (s: string) => s.replace(/[<>&"']/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c]!)

export async function actionReadiness(userId: string, agent: TelegramAgent, action: Action, evidenceComplete = true) {
  const rows = await prisma.operationalAction.findMany({ where: { actionType: `TELEGRAM_ACTION_${action}`, actorId: userId, entityType: agent, status: { in: ['SUCCEEDED', 'FAILED'] } }, orderBy: { createdAt: 'desc' }, take: 100 })
  return assessTelegramReadiness(rows.map(row => { const result = row.result as { verified?: boolean; reviewedCorrect?: boolean } | null; return { verified: result?.verified === true, reviewedCorrect: typeof result?.reviewedCorrect === 'boolean' ? result.reviewedCorrect : null, failed: row.status === 'FAILED' } }), evidenceComplete)
}
export async function proposeTelegramAction(binding: TelegramBinding, args: Record<string, unknown>, requestId: string) {
  const user = await prisma.user.findUnique({ where: { id: binding.userId } })
  if (!user || !telegramEligible(user) || !agentAllowed(binding.agent, user.role)) return { error: 'Access unavailable.' }
  const action = args.action as Action
  if (!['create_task', 'complete_task', 'render_flyer'].includes(action) || (action === 'render_flyer' && binding.agent !== 'graphics')) return { error: 'This action is not available to this agent.' }
  const proposal: Proposal = { action, agent: binding.agent, userId: user.id, nonce: binding.nonce, expiresAt: Date.now() + 15 * 60000, args: {} }
  let summary: string
  if (action === 'create_task') {
    const subject = clean(args.subject, 200), accountId = clean(args.accountId, 80), dueDate = clean(args.dueDate, 40)
    if (!subject || !accountId || !dueDate || !Number.isFinite(Date.parse(dueDate))) return { error: 'Provide an exact accessible account, task subject, and unambiguous due date/time.' }
    const account = await prisma.account.findFirst({ where: { id: accountId, ...accountScope(user), NOT: { zohoId: { startsWith: 'unknown-' } } } })
    if (!account) return { error: 'Account is unavailable or ambiguous.' }
    proposal.args = { subject, accountId, dueDate: new Date(dueDate).toISOString(), description: clean(args.description, 3000) }
    summary = `Create a portal-only task for ${account.name}: ${subject}. Assigned to you; due ${proposal.args.dueDate}. No customer message or Zoho task will be created.`
  } else if (action === 'complete_task') {
    const task = await prisma.task.findFirst({ where: { id: clean(args.taskId, 80), ...accountScope(user) } })
    if (!task || !clean(args.completionEvidence, 1000)) return { error: 'Provide an accessible task ID and a concrete description of the completed work.' }
    proposal.args = { taskId: task.id, completionEvidence: clean(args.completionEvidence, 1000) }
    proposal.expectedUpdatedAt = task.updatedAt.toISOString()
    summary = `Mark portal task "${task.subject}" Completed. Confirm the work is actually done: ${proposal.args.completionEvidence}. This does not update Zoho.`
  } else {
    const product = await prisma.product.findFirst({ where: { id: clean(args.productId, 80), showOnWeb: true, booksItemId: { not: null } } })
    if (!product) return { error: 'Choose an exact published, Books-mapped product first.' }
    proposal.args = { productId: product.id }
    proposal.expectedUpdatedAt = product.updatedAt.toISOString()
    summary = `Generate a branded SVG flyer for ${product.name}, SKU ${product.sku}, using its listed price $${product.price.toFixed(2)}. Deliver the draft only to your private Telegram chat; do not publish it or message customers.`
  }
  const readiness = await actionReadiness(user.id, binding.agent, action)
  const idempotencyKey = `telegram-action:${createHash('sha256').update(JSON.stringify({ requestId, userId: user.id, agent: binding.agent, action, args: proposal.args })).digest('hex')}`
  const row = await prisma.operationalAction.upsert({ where: { idempotencyKey }, create: { idempotencyKey, actionType: `TELEGRAM_ACTION_${action}`, entityType: binding.agent, entityId: proposal.args.accountId || proposal.args.taskId || proposal.args.productId, actorId: user.id, status: 'AWAITING_APPROVAL', maxAttempts: 1, payload: { ...proposal, summary }, result: { readiness } }, update: {} })
  const policy = await prisma.systemSetting.findUnique({ where: { key: policyKey(user.id, binding.agent, action) } })
  if (action === 'create_task' && readiness.eligible && policy?.value === 'enabled') {
    const executed = await approveTelegramAction(binding, row.id, true)
    return { ...executed, readiness, automaticApproval: true }
  }
  return { proposalId: row.id, summary, readiness, requiresApproval: true, approveCommand: `/approve ${row.id}`, cancelCommand: `/cancel ${row.id}` }
}
export async function approveTelegramAction(binding: TelegramBinding, id: string, automatic = false): Promise<{ message: string; svg?: string }> {
  try { return await prisma.$transaction(async tx => {
    const [row, user, link] = await Promise.all([tx.operationalAction.findUnique({ where: { id } }), tx.user.findUnique({ where: { id: binding.userId } }), tx.systemSetting.findUnique({ where: { key: bindingKey(binding.telegramId) } })])
    const proposal = row?.payload as Proposal | null
    if (!row || !proposal || row.actorId !== binding.userId || proposal.userId !== binding.userId || proposal.nonce !== binding.nonce || !user || !telegramEligible(user) || !agentAllowed(proposal.agent, user.role) || !link || JSON.parse(link.value).nonce !== binding.nonce) throw new Error('ACTION_ACCESS_DENIED')
    if (row.status === 'SUCCEEDED') return { message: `Action ${id} already completed. It was not run again.` }
    if (row.status !== 'AWAITING_APPROVAL' || proposal.expiresAt < Date.now()) throw new Error('ACTION_EXPIRED_OR_UNAVAILABLE')
    if (automatic && proposal.action !== 'create_task') throw new Error('AUTO_ACTION_NOT_ALLOWED')
    if (automatic) {
      const policy = await tx.systemSetting.findUnique({ where: { key: policyKey(user.id, proposal.agent, 'create_task') } })
      const readiness = await actionReadiness(user.id, proposal.agent, 'create_task')
      if (policy?.value !== 'enabled' || !readiness.eligible) throw new Error('AUTO_READINESS_NOT_MET')
    }
    const claim = await tx.operationalAction.updateMany({ where: { id, status: 'AWAITING_APPROVAL' }, data: { status: 'RUNNING', startedAt: new Date(), attemptCount: { increment: 1 } } })
    if (!claim.count) throw new Error('ACTION_ALREADY_CLAIMED')
    let message: string, svg: string | undefined, result: Record<string, unknown> = { verified: true, reviewedCorrect: null, approval: automatic ? 'AUTOMATIC_QUALIFIED' : 'USER_COMMAND' }
    if (proposal.action === 'create_task') {
      const account = await tx.account.findFirst({ where: { id: proposal.args.accountId, ...accountScope(user) } })
      if (!account) throw new Error('ACCOUNT_ACCESS_CHANGED')
      const task = await tx.task.create({ data: { zohoId: `telegram-local:${id}`, ownerId: user.id, accountId: account.id, subject: proposal.args.subject, description: proposal.args.description, dueDate: new Date(proposal.args.dueDate), status: 'Not Started' } })
      const check = await tx.task.findUniqueOrThrow({ where: { id: task.id } })
      if (check.ownerId !== user.id || check.accountId !== account.id || check.subject !== proposal.args.subject || check.dueDate?.toISOString() !== proposal.args.dueDate || check.description !== proposal.args.description) throw new Error('ACTION_VERIFICATION_FAILED')
      message = `Created and verified portal task ${task.id}: ${task.subject}. Assigned to you. No Zoho write or customer message was sent.`
      result.taskId = task.id
    } else if (proposal.action === 'complete_task') {
      const changed = await tx.task.updateMany({ where: { id: proposal.args.taskId, ...accountScope(user), updatedAt: new Date(proposal.expectedUpdatedAt!) }, data: { status: 'Completed' } })
      if (changed.count !== 1) throw new Error('TASK_CHANGED_REVIEW_AGAIN')
      const task = await tx.task.findUniqueOrThrow({ where: { id: proposal.args.taskId } })
      if (task.status !== 'Completed') throw new Error('ACTION_VERIFICATION_FAILED')
      result.taskId = task.id; result.completionEvidence = proposal.args.completionEvidence
      message = `Portal task ${task.id} is marked Completed and verified. Zoho was not changed.`
    } else if (proposal.action === 'render_flyer') {
      const product = await tx.product.findFirst({ where: { id: proposal.args.productId, showOnWeb: true, updatedAt: new Date(proposal.expectedUpdatedAt!) } })
      if (!product) throw new Error('PRODUCT_CHANGED_REVIEW_AGAIN')
      const lines = product.name.match(/.{1,28}(?:\s|$)|.{1,28}/g)?.slice(0, 4) || [product.name.slice(0, 28)]
      svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1080" height="1350" viewBox="0 0 1080 1350"><rect width="1080" height="1350" fill="#0b1729"/><path d="M680 0H1080V800Z" fill="#164d73"/><path d="M860 190L960 330L860 470L760 330Z" fill="none" stroke="#e6bd62" stroke-width="12"/><text x="80" y="125" fill="#e6bd62" font-family="Arial,sans-serif" font-size="36" font-weight="700">TITAN DIAMOND</text><text x="80" y="260" fill="#a2b7cf" font-family="Arial,sans-serif" font-size="25">PRODUCT SPOTLIGHT</text>${lines.map((line, i) => `<text x="80" y="${390 + i * 85}" fill="white" font-family="Arial,sans-serif" font-size="60" font-weight="700">${xml(line.trim())}</text>`).join('')}<text x="80" y="870" fill="#e6bd62" font-family="Arial,sans-serif" font-size="94" font-weight="700">$${product.price.toFixed(2)}</text><text x="80" y="940" fill="white" font-family="Arial,sans-serif" font-size="28">SKU ${xml(product.sku.slice(0, 45))}</text><path d="M80 1050H1000" stroke="#355270"/><text x="80" y="1140" fill="white" font-family="Arial,sans-serif" font-size="30">ASK YOUR TITAN REPRESENTATIVE</text><text x="80" y="1250" fill="#a2b7cf" font-family="Arial,sans-serif" font-size="22">DRAFT • Verify terms and price before publication</text></svg>`
      message = `Generated the SVG flyer draft for ${product.name} from the verified catalog record. Review before publication.`
      result.svg = svg; result.productId = product.id
    } else throw new Error('ACTION_UNSUPPORTED')
    await tx.operationalAction.update({ where: { id }, data: { status: 'SUCCEEDED', completedAt: new Date(), result: result as any } })
    return { message: `${message}\nAction: ${id}\nAfter reviewing the outcome, report /review ${id} correct or /review ${id} incorrect.`, ...(svg ? { svg } : {}) }
  }, { timeout: 20000 }) } catch (error) {
    await prisma.operationalAction.updateMany({ where: { id, actorId: binding.userId, status: 'AWAITING_APPROVAL', actionType: { startsWith: 'TELEGRAM_ACTION_' } }, data: { status: 'FAILED', completedAt: new Date(), errorCode: 'ACTION_NOT_VERIFIED', errorMessage: 'Action was not completed; review changed data, access, or expiration before a new proposal.' } })
    throw error
  }
}
export async function reviewTelegramAction(binding: TelegramBinding, id: string, correct: boolean) {
  const row = await prisma.operationalAction.findFirst({ where: { id, actorId: binding.userId, actionType: { startsWith: 'TELEGRAM_ACTION_' }, status: 'SUCCEEDED' } })
  if (!row || (row.payload as unknown as Proposal).nonce !== binding.nonce) return 'This action is unavailable for your review.'
  const result = row.result as Record<string, unknown>
  if (typeof result.reviewedCorrect === 'boolean') return 'This outcome has already been reviewed.'
  const changed = await prisma.operationalAction.updateMany({ where: { id, updatedAt: row.updatedAt }, data: { result: { ...result, reviewedCorrect: correct, reviewedAt: new Date().toISOString(), reviewedBy: binding.userId } as any } })
  if (!changed.count) return 'The review changed concurrently; refresh before reviewing again.'
  return correct ? 'Verified outcome review recorded. Readiness will be recalculated for this action type.' : 'Incorrect outcome recorded. This action type no longer qualifies for automatic approval until its recent history clears the failure gate.'
}
export async function setTelegramAuto(binding: TelegramBinding, enabled: boolean) {
  const user = await prisma.user.findUnique({ where: { id: binding.userId } })
  if (!user || !agentAllowed('accounting', user.role)) return 'Only management can enable automatic approval.'
  const readiness = await actionReadiness(user.id, binding.agent, 'create_task')
  if (enabled && !readiness.eligible) return `Automatic approval remains off. Readiness ${readiness.score}/100; ${readiness.reviewed}/50 reviewed outcomes. It requires at least 50 reviewed outcomes, 98% correct, score 95+, and no recent failures.`
  const key = policyKey(user.id, binding.agent, 'create_task'), value = enabled ? 'enabled' : 'disabled'
  await prisma.systemSetting.upsert({ where: { key }, create: { key, value }, update: { value } })
  return `Automatic approval for this agent's portal-only task creation is ${enabled ? 'enabled' : 'disabled'}. Other actions still require approval. Readiness is checked before each action.`
}
