import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import { requireAdministrator } from "@/lib/auth-helpers"

export async function GET() {
  const auth = await requireAdministrator()
  if (auth.errorResponse) return auth.errorResponse
  const since = new Date(Date.now() - 30 * 24 * 60 * 60_000)
  const [actions, completed, openAssignments, commitments, packages] = await Promise.all([
    prisma.operationalAction.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.workAssignment.findMany({ where: { completedAt: { gte: since } }, select: { createdAt: true, completedAt: true } }),
    prisma.workAssignment.findMany({ where: { status: "OPEN" }, select: { createdAt: true, dueAt: true, stage: true } }),
    prisma.salesCommitment.groupBy({ by: ["status"], where: { createdAt: { gte: since } }, _count: true }),
    prisma.package.findMany({ where: { updatedAt: { gte: since } }, select: { createdAt: true, updatedAt: true, trackingNumber: true } }),
  ])
  const actionCounts = Object.fromEntries(actions.map(row => [row.status, row._count]))
  const totalActions = Object.values(actionCounts).reduce((sum, value) => sum + value, 0)
  const cycleHours = completed.filter(row => row.completedAt).map(row => (row.completedAt!.getTime() - row.createdAt.getTime()) / 3_600_000)
  const now = Date.now()
  const overdue = openAssignments.filter(row => row.dueAt && row.dueAt.getTime() < now).length
  const commitmentCounts = Object.fromEntries(commitments.map(row => [row.status, row._count]))
  const promisesClosed = (commitmentCounts.COMPLETED || 0) + (commitmentCounts.MISSED || 0)
  const tracked = packages.filter(row => row.trackingNumber)
  return NextResponse.json({ periodDays: 30, metrics: {
    firstAttemptSuccessRate: totalActions ? Math.round(((actionCounts.SUCCEEDED || 0) / totalActions) * 1000) / 10 : null,
    failedActions: (actionCounts.FAILED || 0) + (actionCounts.DEAD_LETTER || 0),
    averageCycleHours: cycleHours.length ? Math.round(cycleHours.reduce((a, b) => a + b, 0) / cycleHours.length * 10) / 10 : null,
    activeWork: openAssignments.length, overdueWork: overdue,
    promiseKeptRate: promisesClosed ? Math.round(((commitmentCounts.COMPLETED || 0) / promisesClosed) * 1000) / 10 : null,
    shipmentTrackingRate: packages.length ? Math.round((tracked.length / packages.length) * 1000) / 10 : null,
  }, byStage: Object.entries(openAssignments.reduce<Record<string, number>>((acc, row) => ({ ...acc, [row.stage]: (acc[row.stage] || 0) + 1 }), {})).map(([stage, count]) => ({ stage, count })) })
}
