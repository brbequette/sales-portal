import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export const dynamic = "force-dynamic"

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const now = new Date()
  const [assignments, actions, exceptions, emailEvents, tasks, salesOrders, draftInvoices] = await Promise.all([
    prisma.workAssignment.findMany({ where: { status: "OPEN" }, orderBy: [{ priority: "desc" }, { dueAt: "asc" }], take: 500 }),
    prisma.operationalAction.findMany({ where: { status: { in: ["FAILED", "DEAD_LETTER"] } }, orderBy: { updatedAt: "asc" }, take: 200 }),
    prisma.integrationException.findMany({ where: { status: "OPEN" }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.emailOperationalEvent.findMany({ where: { status: "REVIEW_REQUIRED" }, orderBy: { createdAt: "asc" }, take: 200 }),
    prisma.task.findMany({ where: { status: { notIn: ["Completed", "COMPLETED"] }, dueDate: { lte: new Date(now.getTime() + 48 * 60 * 60_000) } }, include: { account: { select: { name: true } }, owner: { select: { name: true } } }, orderBy: { dueDate: "asc" }, take: 200 }),
    prisma.salesOrder.findMany({ where: { status: { notIn: ["Void", "void", "voided", "Cancelled", "cancelled", "Invoiced", "invoiced", "billed"] } }, include: { account: { include: { owner: { select: { id: true, name: true } } } } }, orderBy: { orderDate: "asc" }, take: 1000 }),
    prisma.invoice.findMany({ where: { salesOrderZohoId: { not: null }, status: { in: ["Draft", "draft"] } }, include: { account: { include: { owner: { select: { id: true, name: true } } } } }, orderBy: { issueDate: "asc" }, take: 1000 }),
  ])
  const assignedKeys = new Set(assignments.map(row => `${row.entityType}:${row.entityId}`))
  const rows = [
    ...assignments.map(x => ({ id: `assignment:${x.id}`, kind: "WORK", entityType: x.entityType, entityId: x.entityId, number: x.entityNumber, title: x.nextAction, stage: x.stage, owner: x.ownerName, dueAt: x.dueAt, priority: x.priority, blocker: x.blockedReason, href: x.entityType === "SALES_ORDER" ? "/processing" : null })),
    ...actions.map(x => ({ id: `action:${x.id}`, kind: "ZOHO_FAILURE", entityType: x.entityType, entityId: x.entityId, number: x.entityNumber, title: `${x.actionType} failed`, stage: "INTEGRATION", owner: x.actorName, dueAt: x.nextAttemptAt, priority: x.status === "DEAD_LETTER" ? 100 : 90, blocker: x.errorMessage, actionId: x.id, href: "/admin/operations-center" })),
    ...exceptions.map(x => ({ id: `exception:${x.id}`, kind: "UNMATCHED", entityType: x.entityType, entityId: x.externalId, number: x.externalNumber, title: x.summary, stage: "MATCHING", dueAt: x.createdAt, priority: 95, blocker: x.exceptionType, href: "/admin/operations-center" })),
    ...emailEvents.map(x => ({ id: `email:${x.id}`, kind: "EMAIL_REVIEW", entityType: x.eventType, entityId: x.id, title: x.summary, stage: "EMAIL REVIEW", dueAt: x.createdAt, priority: x.conflictReason ? 90 : 70, blocker: x.conflictReason, href: "/admin/email-intelligence" })),
    ...tasks.map(x => ({ id: `task:${x.id}`, kind: "TASK", entityType: "TASK", entityId: x.id, number: null, title: x.subject, stage: "FOLLOW-UP", owner: x.owner.name, dueAt: x.dueDate, priority: x.dueDate && x.dueDate < now ? 85 : 60, blocker: x.account?.name, href: "/tasks" })),
    ...salesOrders.filter(x => !assignedKeys.has(`SALES_ORDER:${x.zohoId || x.id}`)).map(x => { const items = (x.items as any) || {}; const number = items.salesorder_number || items.salesOrderNumber || x.zohoId; const exception = x.syncConflict || x.pendingCostSync || x.pendingZohoFetch; return { id: `salesorder:${x.id}`, kind: "WORK", entityType: "SALES_ORDER", entityId: x.zohoId || x.id, number, title: exception ? `Resolve blockers on sales order ${number}` : `Advance sales order ${number}`, stage: exception ? "EXCEPTION" : "FULFILLMENT", owner: x.account.owner.name, dueAt: new Date(x.orderDate.getTime() + 2 * 86_400_000), priority: exception ? 96 : 65, blocker: x.syncConflict ? "Sync conflict" : x.pendingCostSync ? "Cost calculation required" : x.pendingZohoFetch ? "Zoho detail confirmation pending" : null, href: "/processing" } }),
    ...draftInvoices.filter(x => !assignedKeys.has(`INVOICE:${x.zohoId}`)).map(x => ({ id: `invoice:${x.id}`, kind: "WORK", entityType: "INVOICE", entityId: x.zohoId, number: x.invoiceNumber, title: `Send draft invoice ${x.invoiceNumber || x.zohoId}`, stage: "BILLING", owner: x.account.owner.name, dueAt: new Date(x.issueDate.getTime() + 86_400_000), priority: x.syncConflict ? 96 : 75, blocker: x.syncConflict ? "Sync conflict" : x.pendingZohoFetch ? "Zoho detail confirmation pending" : null, href: "/processing" })),
  ].sort((a, b) => b.priority - a.priority || new Date(a.dueAt || 0).getTime() - new Date(b.dueAt || 0).getTime())
  return NextResponse.json({ generatedAt: now.toISOString(), total: rows.length, rows })
}
