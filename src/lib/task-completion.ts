import { createHash } from 'node:crypto'
import type { PrismaClient } from '@prisma/client'

export const TASK_RESULTS = ['COMPLETED', 'WON', 'LOST', 'NO_ANSWER', 'FOLLOW_UP', 'BLOCKED'] as const
export type CompletionInput = { requestId: string; summary: string; outcomeType: string; nextAction?: string; followUpAt?: string; invoiceNumber?: string }
export function parseTaskCompletion(value: unknown, now = new Date()): CompletionInput {
  if (!value || typeof value !== 'object') throw new Error('Completion details required')
  const input = value as Record<string, unknown>
  const text = (key: string, max: number) => {
    if (input[key] !== undefined && typeof input[key] !== 'string') throw new Error(`Invalid ${key}`)
    const result = String(input[key] || '').trim()
    if (result.length > max) throw new Error(`${key} is too long`)
    return result
  }
  const requestId = text('requestId', 80), summary = text('summary', 2000), outcomeType = text('outcomeType', 30)
  const nextAction = text('nextAction', 300), followUpAt = text('followUpAt', 40), invoiceNumber = text('invoiceNumber', 100)
  if (!/^[a-zA-Z0-9_-]{16,80}$/.test(requestId)) throw new Error('Invalid completion request ID')
  if (!summary) throw new Error('Describe the result before completing this task')
  if (!(TASK_RESULTS as readonly string[]).includes(outcomeType)) throw new Error('Choose a valid outcome')
  if (Boolean(nextAction) !== Boolean(followUpAt)) throw new Error('A next step needs both an action and a due date')
  if (followUpAt && (!Number.isFinite(Date.parse(followUpAt)) || Date.parse(followUpAt) <= +now)) throw new Error('Choose a future follow-up date and time')
  return { requestId, summary, outcomeType, nextAction, followUpAt, invoiceNumber }
}
export function completionId(taskId: string, requestId: string) {
  return `task_completion_${createHash('sha256').update(`${taskId}:${requestId}`).digest('hex')}`
}

export async function saveTaskCompletion(db: PrismaClient, task: any, update: any, input: CompletionInput,
  actor: { id: string; name?: string | null }, invoiceId?: string) {
  const id = completionId(task.id, input.requestId)
  return db.$transaction(async tx => {
    const receipt = await tx.taskOutcome.findUnique({ where: { id } })
    if (receipt) return { outcome: receipt, repeated: true }
    // Conditional update locks the task. Concurrent clicks cannot create two next steps.
    const changed = await tx.task.updateMany({ where: { id: task.id, status: { not: 'Completed' } }, data: { ...update, status: 'Completed' } })
    if (!changed.count) throw new Error('This task is already completed. Refresh to see its outcome.')
    const accountId = task.accountId || task.deal?.accountId || null
    const outcome = await tx.taskOutcome.create({ data: { id, taskId: task.id, outcomeType: input.outcomeType,
      summary: input.summary, nextAction: input.nextAction || null, followUpAt: input.followUpAt ? new Date(input.followUpAt) : null,
      accountId, documentType: invoiceId || task.invoiceId ? 'INVOICE' : task.salesOrderId ? 'SALES_ORDER' : task.quoteId || task.estimateId ? 'QUOTE' : null,
      documentId: invoiceId || task.invoiceId || task.salesOrderId || task.quoteId || task.estimateId || null,
      actorId: actor.id, actorName: actor.name || null } })
    const followUp = input.nextAction ? await tx.task.create({ data: {
      zohoId: `task_followup_${id}`, subject: input.nextAction, description: `Follow-up from: ${task.subject}\nResult: ${input.summary}`,
      dueDate: new Date(input.followUpAt!), ownerId: task.ownerId, accountId, dealId: task.dealId, leadId: task.leadId,
      type: task.type || 'Task', priority: task.priority || 'Normal', status: 'Not Started',
      invoiceId: invoiceId || task.invoiceId, salesOrderId: task.salesOrderId, quoteId: task.quoteId, estimateId: task.estimateId,
    } }) : null
    await tx.operationalEvent.create({ data: { entityType: 'TASK', entityId: task.id, accountId,
      eventType: 'TASK_COMPLETED', title: `Task completed: ${task.subject}`, detail: input.summary,
      metadata: { outcomeId: id, outcomeType: input.outcomeType, followUpTaskId: followUp?.id || null, nextAction: input.nextAction || null },
      actorId: actor.id, actorName: actor.name || null } })
    return { outcome, followUp, repeated: false }
  })
}
