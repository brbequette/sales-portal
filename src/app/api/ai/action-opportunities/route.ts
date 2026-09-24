import { NextResponse } from 'next/server'
import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/auth'
import { prisma } from '@/lib/prisma'
import { normalizeAiRole } from '@/lib/ai-action-policy'

export const dynamic = 'force-dynamic'

type Opportunity = {
  id: string
  label: string
  detail: string
  count: number
  prompt: string
  urgency: number
}

export async function GET() {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ success: false, error: 'Authentication required' }, { status: 401 })

  const sessionUser = session.user as typeof session.user & { dbId?: string; id?: string; role?: string }
  const user = await prisma.user.findFirst({
    where: { OR: [
      { id: sessionUser.dbId || '__missing__' },
      { zohoId: sessionUser.id || '__missing__' },
      { email: sessionUser.email || '__missing__' },
    ] },
    select: { id: true, role: true },
  })
  if (!user) return NextResponse.json({ success: false, error: 'User record not found' }, { status: 404 })

  const admin = ['ADMIN', 'MANAGER'].includes(normalizeAiRole(user.role || sessionUser.role || ''))
  const accountScope = admin ? {} : { account: { ownerId: user.id } }
  const taskScope = admin ? {} : { ownerId: user.id }
  const now = new Date()
  const nextWeek = new Date(now.getTime() + 7 * 86400000)
  const incomplete = { notIn: ['Completed', 'completed', 'Cancelled', 'cancelled'] }

  const [overdueTasks, upcomingTasks, pendingOrders, draftInvoices, costExceptions, overdueInvoices] = await Promise.all([
    prisma.task.count({ where: { ...taskScope, status: incomplete, dueDate: { lt: now } } }),
    prisma.task.count({ where: { ...taskScope, status: incomplete, dueDate: { gte: now, lte: nextWeek } } }),
    prisma.salesOrder.count({ where: { ...accountScope, status: { in: ['Draft', 'draft', 'Pending', 'pending'] } } }),
    prisma.invoice.count({ where: { ...accountScope, status: { in: ['Draft', 'draft'] } } }),
    prisma.invoice.count({ where: { ...accountScope, status: { notIn: ['void', 'Void'] }, OR: [{ pendingCostSync: true }, { costsCalculatedAt: null }, { syncConflict: true }, { computedProfit: { lt: 0 } }, { computedUpfront: null }, { computedFinal: null }] } }),
    prisma.invoice.count({ where: { ...accountScope, balance: { gt: 0 }, dueDate: { lt: now }, status: { notIn: ['void', 'Void', 'paid', 'Paid'] } } }),
  ])

  const opportunities: Opportunity[] = [
    overdueTasks && { id: 'overdue-tasks', label: 'Work overdue tasks', detail: 'Prioritize engagement steps and complete follow-ups', count: overdueTasks, urgency: 100, prompt: 'Review my overdue tasks and engagement steps. Prioritize them, link every record, and offer the actions you can perform now.' },
    pendingOrders && { id: 'pending-orders', label: 'Process pending orders', detail: 'Review orders ready for confirmation or fulfillment', count: pendingOrders, urgency: 90, prompt: 'Review pending and draft sales orders that need processing. Link each order and offer the next qualified action you can perform.' },
    draftInvoices && { id: 'draft-invoices', label: 'Finish draft invoices', detail: 'Review invoices waiting to be completed or sent', count: draftInvoices, urgency: 80, prompt: 'Review draft invoices that need processing. Verify each record, link it, and offer the next qualified action you can perform.' },
    costExceptions && { id: 'costs', label: 'Fix financial calculations', detail: 'Find invoices missing completed cost processing', count: costExceptions, urgency: 75, prompt: 'Review invoices with pending or missing cost calculations. Link the affected records and offer to process the qualified fixes.' },
    overdueInvoices && { id: 'collections', label: 'Handle overdue collections', detail: 'Prioritize unpaid balances and follow-up work', count: overdueInvoices, urgency: 70, prompt: 'Review overdue collections, prioritize the accounts, link every invoice and account, and offer the follow-up actions you can perform.' },
    upcomingTasks && { id: 'upcoming', label: 'Prepare upcoming work', detail: 'Review engagement steps due in the next 7 days', count: upcomingTasks, urgency: 60, prompt: 'Review my tasks and engagement steps due in the next 7 days. Link each record and offer to handle the next actions.' },
    admin && { id: 'forecast', label: 'Review forecast and risks', detail: 'Project month-end sales, profit, pipeline, and cash exposure', count: 1, urgency: 55, prompt: 'Give me the verified management forecast. Explain the projection method, pipeline, overdue cash risk, and the actions you recommend.' },
  ].filter(Boolean) as Opportunity[]

  opportunities.sort((a, b) => b.urgency - a.urgency)
  return NextResponse.json({ success: true, opportunities: opportunities.slice(0, 6) })
}
