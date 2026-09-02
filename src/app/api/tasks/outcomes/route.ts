import { NextResponse } from "next/server"
import { getServerSession } from "next-auth"
import { authOptions } from "@/lib/auth"
import { prisma } from "@/lib/prisma"

const OUTCOME_TYPES = new Set(["UPDATE", "COMPLETED", "NO_ANSWER", "FOLLOW_UP", "BLOCKED", "CANCELLED"])

function canAccessTask(user: { dbId?: string; id?: string; role?: string }, ownerId: string) {
  const actorId = user.dbId || user.id
  const role = String(user.role || "").toLowerCase()
  return ownerId === actorId || role.includes("admin") || role.includes("manager")
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const body = await request.json()
  const task = await prisma.task.findFirst({ where: { OR: [{ id: String(body.taskId || "") }, { zohoId: String(body.taskId || "") }] } })
  if (!task) return NextResponse.json({ error: "Task not found" }, { status: 404 })
  const actorId = session.user.dbId || session.user.id
  if (!canAccessTask(session.user, task.ownerId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  if (!String(body.summary || "").trim()) return NextResponse.json({ error: "Outcome summary is required" }, { status: 400 })
  const outcomeType = String(body.outcomeType || "UPDATE").toUpperCase()
  if (!OUTCOME_TYPES.has(outcomeType)) return NextResponse.json({ error: "Unsupported outcome type" }, { status: 400 })
  const followUpAt = body.followUpAt ? new Date(body.followUpAt) : null
  if (followUpAt && Number.isNaN(followUpAt.getTime())) return NextResponse.json({ error: "Invalid follow-up date" }, { status: 400 })
  const outcome = await prisma.taskOutcome.create({ data: {
    taskId: task.id, outcomeType, summary: String(body.summary).trim(),
    nextAction: body.nextAction ? String(body.nextAction).trim() : null, followUpAt,
    accountId: task.accountId, documentType: task.invoiceId ? "INVOICE" : task.salesOrderId ? "SALES_ORDER" : task.quoteId || task.estimateId ? "QUOTE" : null,
    documentId: task.invoiceId || task.salesOrderId || task.quoteId || task.estimateId, actorId, actorName: session.user.name || session.user.email,
  } })
  await prisma.operationalEvent.create({ data: { entityType: "TASK", entityId: task.id, accountId: task.accountId, eventType: "TASK_OUTCOME", title: `Task outcome: ${outcome.outcomeType}`, detail: outcome.summary, metadata: { nextAction: outcome.nextAction, followUpAt: outcome.followUpAt }, actorId, actorName: session.user.name || session.user.email } })
  return NextResponse.json({ success: true, outcome }, { status: 201 })
}

export async function GET(request: Request) {
  const session = await getServerSession(authOptions)
  if (!session?.user) return NextResponse.json({ error: "Authentication required" }, { status: 401 })
  const taskId = new URL(request.url).searchParams.get("taskId")
  if (!taskId) return NextResponse.json({ error: "taskId required" }, { status: 400 })
  const task = await prisma.task.findFirst({ where: { OR: [{ id: taskId }, { zohoId: taskId }] }, select: { id: true, ownerId: true } })
  if (!task) return NextResponse.json({ outcomes: [] })
  if (!canAccessTask(session.user, task.ownerId)) return NextResponse.json({ error: "Forbidden" }, { status: 403 })
  return NextResponse.json({ outcomes: await prisma.taskOutcome.findMany({ where: { taskId: task.id }, orderBy: { createdAt: "desc" } }) })
}
