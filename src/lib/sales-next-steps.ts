export type SalesRecord = { id?: string; zohoId?: string; name?: string; subject?: string; stage?: string; status?: string; dueDate?: string | null; closingDate?: string | null }
export type SalesAccount = { id: string; name: string; deals?: SalesRecord[]; tasks?: SalesRecord[]; quotes?: SalesRecord[]; salesOrders?: SalesRecord[] }
export type SalesStep = { key: string; title: string; reason: string; record: string; urgent: boolean; existingTask: boolean }

const normalize = (value?: string) => (value || '').trim().toLowerCase().replace(/[_-]/g, ' ')
const closed = (value?: string) => /^(closed|completed|cancelled|canceled|lost|won|paid|void|declined|invoiced|delivered|fulfilled)$/.test(normalize(value)) || /^closed (won|lost)$/.test(normalize(value))

/** Suggestions only. Source stages are never changed by viewing this queue. */
export function salesNextSteps(account: SalesAccount, now = Date.now()): SalesStep[] {
  const steps: SalesStep[] = []
  for (const task of account.tasks || []) {
    if (closed(task.status)) continue
    const due = task.dueDate ? Date.parse(task.dueDate) : NaN
    steps.push({ key: `task:${task.id}`, title: task.subject || 'Review open task', reason: Number.isFinite(due) ? `Due ${task.dueDate!.slice(0, 10)}` : 'No due date set — agree a follow-up date.', record: `Task ${task.id || task.zohoId || ''}`, urgent: due < now, existingTask: true })
  }
  for (const deal of account.deals || []) {
    if (closed(deal.stage)) continue
    const stage = normalize(deal.stage)
    const title = /negotiat|decision/.test(stage) ? 'Resolve objections and agree the decision date'
      : /quote|proposal/.test(stage) ? 'Confirm the quote was reviewed and agree a next step'
      : /qualif|discover|prospect/.test(stage) ? 'Confirm needs, decision maker and timing'
      : /ship|order|fulfill/.test(stage) ? 'Check order progress and confirm delivery expectations'
      : 'Review the deal and agree the next milestone'
    const overdue = !!deal.closingDate && Date.parse(deal.closingDate) < now
    steps.push({ key: `deal:${deal.id}`, title, reason: `${deal.name || 'Deal'} · ${deal.stage || 'Stage not recorded'}${overdue ? ' · Closing date has passed' : ''}`, record: `Deal ${deal.id || deal.zohoId || ''}`, urgent: overdue, existingTask: false })
  }
  for (const quote of account.quotes || []) {
    if (!['draft', 'sent', 'accepted'].includes(normalize(quote.status))) continue
    steps.push({ key: `quote:${quote.id}`, title: normalize(quote.status) === 'accepted' ? 'Review accepted quote for order handoff' : normalize(quote.status) === 'draft' ? 'Review and complete the draft quote' : 'Follow up on the sent quote', reason: `Quote ${quote.zohoId || quote.id} · ${quote.status}`, record: `Quote ${quote.id || quote.zohoId}`, urgent: false, existingTask: false })
  }
  for (const order of account.salesOrders || []) {
    if (!['draft', 'pending', 'confirmed', 'open'].includes(normalize(order.status))) continue
    steps.push({ key: `order:${order.id}`, title: 'Review order readiness and fulfillment', reason: `Sales order ${order.zohoId || order.id} · ${order.status}`, record: `Sales order ${order.id || order.zohoId}`, urgent: false, existingTask: false })
  }
  return steps.sort((a, b) => Number(b.urgent) - Number(a.urgent))
}

export function salesStepPrompt(account: SalesAccount, step?: SalesStep, automation = false) {
  return `For account ${account.name} (account ID ${account.id}), ${step ? `help with: ${step.title}. Source: ${step.record}. ${step.reason}.` : 'review all open deals, tasks, quotes and orders and prioritize the next actions.'} Verify current records and cite the supporting records. ${automation ? 'Propose a follow-up workflow with owner, timing, reminders, conditions to stop, and a draft message. Check existing tasks and automations for duplicates. Present supported automation actions for review; do not activate or send anything without confirmation.' : 'Give a concise action plan and a draft customer follow-up. Identify missing information; do not invent facts or change deal stages automatically.'}`
}
